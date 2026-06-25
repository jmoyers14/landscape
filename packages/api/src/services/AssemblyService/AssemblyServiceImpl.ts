import { inject, injectable } from "tsyringe";
import {
  ASSEMBLY_REPOSITORY_TOKEN,
  MATERIAL_REPOSITORY_TOKEN,
} from "../../data-access/tokens.ts";
import { PRICING_SETTINGS_SERVICE_TOKEN } from "../tokens.ts";
import type {
  Assembly,
  AssemblyRepository,
} from "../../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type { MaterialRepository } from "../../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import {
  FormulaError,
  assertReferencesKnown,
  validateLineFormulas,
} from "../EstimateService/formula.ts";
import { ServiceError } from "../errors.ts";
import type { PricingSettingsService } from "../PricingSettingsService/PricingSettingsService.ts";
import type {
  AssemblyService,
  AssemblyServiceInput,
} from "./AssemblyService.ts";

// Keys are used as formula variables, so they must be valid identifiers.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Owns the rules for authoring an assembly. Injects the material repository and
 * pricing-settings service so it can verify every reference resolves before the
 * recipe is saved — catching a bad formula or dangling reference at author time
 * rather than when an estimate later generates from it.
 */
@injectable()
export class AssemblyServiceImpl implements AssemblyService {
  constructor(
    @inject(ASSEMBLY_REPOSITORY_TOKEN)
    private readonly assemblies: AssemblyRepository,
    @inject(MATERIAL_REPOSITORY_TOKEN)
    private readonly materials: MaterialRepository,
    @inject(PRICING_SETTINGS_SERVICE_TOKEN)
    private readonly pricingSettings: PricingSettingsService,
  ) {}

  list(orgId: string): Promise<Assembly[]> {
    return this.assemblies.findByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<Assembly | null> {
    return this.assemblies.findById(orgId, id);
  }

  async create(orgId: string, input: AssemblyServiceInput): Promise<Assembly> {
    const data = await this.validate(orgId, input);
    // Assemblies authored in-app are "custom"; only the seed sets "starter".
    return this.assemblies.create(orgId, { ...data, source: "custom" });
  }

  async update(
    orgId: string,
    id: string,
    input: AssemblyServiceInput,
  ): Promise<Assembly> {
    const data = await this.validate(orgId, input);
    // `source` is intentionally omitted so an edit preserves the existing marker.
    const updated = await this.assemblies.update(orgId, id, data);
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Assembly not found");
    }
    return updated;
  }

  remove(orgId: string, id: string): Promise<void> {
    return this.assemblies.deleteById(orgId, id);
  }

  // Validates + normalizes an assembly. Throws BAD_REQUEST on any structural
  // problem so the tRPC boundary returns a 400 with the specific reason.
  private async validate(
    orgId: string,
    input: AssemblyServiceInput,
  ): Promise<AssemblyServiceInput> {
    const name = input.name.trim();
    if (!name) {
      throw new ServiceError("BAD_REQUEST", "Assembly name is required");
    }

    const driverKeys = collectKeys(
      "driver",
      input.drivers.map((driver) => driver.key),
    );
    const lineKeys = collectKeys(
      "line",
      input.lines.map((line) => line.key),
    );

    // Structural formula validation; translate FormulaError -> BAD_REQUEST.
    try {
      validateLineFormulas(input.lines, driverKeys);
      const allowed = new Set([...driverKeys, ...lineKeys]);
      for (const line of input.lines) {
        if (line.kind === "material" && line.deliveriesFormula) {
          assertReferencesKnown(line.deliveriesFormula, allowed);
        }
      }
    } catch (error) {
      if (error instanceof FormulaError) {
        throw new ServiceError("BAD_REQUEST", error.message);
      }
      throw error;
    }

    await this.assertMaterialsExist(orgId, input);
    await this.assertLaborRatesExist(orgId, input);

    return {
      ...input,
      name,
      category: input.category.trim() || "General",
      description: input.description?.trim() || null,
    };
  }

  private async assertMaterialsExist(
    orgId: string,
    input: AssemblyServiceInput,
  ): Promise<void> {
    const ids = new Set<string>();
    for (const line of input.lines) {
      if (line.kind === "material") {
        ids.add(line.materialId);
      }
    }
    if (ids.size === 0) {
      return;
    }
    const found = await this.materials.findByIds(orgId, [...ids]);
    const foundIds = new Set(found.map((material) => material.id));
    for (const id of ids) {
      if (!foundIds.has(id)) {
        throw new ServiceError(
          "BAD_REQUEST",
          `Material line references unknown material "${id}"`,
        );
      }
    }
  }

  private async assertLaborRatesExist(
    orgId: string,
    input: AssemblyServiceInput,
  ): Promise<void> {
    const keys = new Set<string>();
    for (const line of input.lines) {
      if (line.kind === "labor") {
        keys.add(line.laborRateKey);
      }
    }
    if (keys.size === 0) {
      return;
    }
    const settings = await this.pricingSettings.get(orgId);
    const rateKeys = new Set(settings.laborRates.map((rate) => rate.key));
    for (const key of keys) {
      if (!rateKeys.has(key)) {
        throw new ServiceError(
          "BAD_REQUEST",
          `Labor line references unknown labor rate "${key}"`,
        );
      }
    }
  }
}

// Validates each key is a usable identifier and unique within its group.
function collectKeys(label: string, keys: string[]): Set<string> {
  const seen = new Set<string>();
  for (const key of keys) {
    if (!IDENTIFIER.test(key)) {
      throw new ServiceError(
        "BAD_REQUEST",
        `${label} key "${key}" must be a valid identifier (letters, digits, underscore; not starting with a digit)`,
      );
    }
    if (seen.has(key)) {
      throw new ServiceError("BAD_REQUEST", `Duplicate ${label} key "${key}"`);
    }
    seen.add(key);
  }
  return seen;
}
