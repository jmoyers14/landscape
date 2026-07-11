import { inject, injectable } from "tsyringe";
import {
  ASSEMBLY_REPOSITORY_TOKEN,
  ESTIMATE_REPOSITORY_TOKEN,
  MATERIAL_REPOSITORY_TOKEN,
  PROJECT_REPOSITORY_TOKEN,
} from "../../data-access/tokens.ts";
import { PRICING_SETTINGS_SERVICE_TOKEN } from "../tokens.ts";
import type {
  Estimate,
  EstimateAssembly,
  EstimateRepository,
  LineItemInput,
} from "../../data-access/repositories/EstimateRepository/EstimateRepository.ts";
import type { ProjectRepository } from "../../data-access/repositories/ProjectRepository/ProjectRepository.ts";
import type { AssemblyRepository } from "../../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type { MaterialRepository } from "../../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import type { PricingSettingsService } from "../PricingSettingsService/PricingSettingsService.ts";
import { ServiceError } from "../errors.ts";
import {
  computeEstimate,
  generateAssemblyLines,
  resolveDriverValues,
  type EstimateView,
} from "@landscape/domain";
import type {
  EstimateContext,
  EstimateService,
  EstimateSummary,
  SelectAssemblyInput,
  UpdateEstimateMetaInput,
} from "./EstimateService.ts";

/**
 * Estimate business logic. An estimate's line items are a generated snapshot:
 * `setAssemblies` runs the chosen catalog assemblies + driver values through the
 * engine and freezes the result (with the rates used), so a sent estimate's
 * money never drifts when the catalog changes. Reads always recompute totals
 * from the stored snapshot via the calc engine.
 */
@injectable()
export class EstimateServiceImpl implements EstimateService {
  constructor(
    @inject(ESTIMATE_REPOSITORY_TOKEN)
    private readonly estimates: EstimateRepository,
    @inject(PROJECT_REPOSITORY_TOKEN)
    private readonly projects: ProjectRepository,
    @inject(ASSEMBLY_REPOSITORY_TOKEN)
    private readonly assemblies: AssemblyRepository,
    @inject(MATERIAL_REPOSITORY_TOKEN)
    private readonly materials: MaterialRepository,
    @inject(PRICING_SETTINGS_SERVICE_TOKEN)
    private readonly pricingSettings: PricingSettingsService,
  ) {}

  async listByProject(
    orgId: string,
    projectId: string,
  ): Promise<EstimateSummary[]> {
    const estimates = await this.estimates.findByProject(orgId, projectId);
    return estimates.map((estimate) => {
      const { totals } = computeEstimate(estimate);
      return {
        id: estimate.id,
        title: estimate.title,
        status: estimate.status,
        total: totals.total,
        createdAt: estimate.createdAt,
      };
    });
  }

  async getContext(orgId: string): Promise<EstimateContext> {
    const [assemblies, materials, pricing] = await Promise.all([
      this.assemblies.findByOrg(orgId),
      this.materials.findByOrg(orgId),
      this.pricingSettings.get(orgId),
    ]);
    return { assemblies, materials, pricing };
  }

  async get(orgId: string, id: string): Promise<EstimateView | null> {
    const estimate = await this.estimates.findById(orgId, id);
    return estimate ? computeEstimate(estimate) : null;
  }

  async create(
    orgId: string,
    projectId: string,
    title?: string,
  ): Promise<EstimateView> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) {
      throw new ServiceError("BAD_REQUEST", "Project does not exist");
    }

    let resolvedTitle = title?.trim();
    if (!resolvedTitle) {
      const existing = await this.estimates.findByProject(orgId, projectId);
      resolvedTitle = `Estimate ${existing.length + 1}`;
    }

    // Snapshot the org's current rates so a fresh estimate has sensible defaults
    // before any assemblies are added; setAssemblies re-snapshots on generation.
    const settings = await this.pricingSettings.get(orgId);
    const estimate = await this.estimates.create(orgId, {
      projectId,
      title: resolvedTitle,
      status: "draft",
      overheadRate: settings.overheadRate,
      profitRate: settings.profitRate,
      taxRate: settings.taxRate,
    });
    return computeEstimate(estimate);
  }

  async updateMeta(
    orgId: string,
    id: string,
    input: UpdateEstimateMetaInput,
  ): Promise<EstimateView> {
    const estimate = await this.estimates.updateMeta(orgId, id, input);
    return this.requireView(estimate);
  }

  async setAssemblies(
    orgId: string,
    id: string,
    selections: SelectAssemblyInput[],
  ): Promise<EstimateView> {
    const estimate = await this.estimates.findById(orgId, id);
    if (!estimate) {
      throw new ServiceError("NOT_FOUND", "Estimate not found");
    }
    if (estimate.status !== "draft") {
      throw new ServiceError(
        "BAD_REQUEST",
        "Only draft estimates can be regenerated",
      );
    }

    const settings = await this.pricingSettings.get(orgId);

    // Load each chosen assembly and resolve its driver values up front.
    const chosen = [];
    for (const selection of selections) {
      const assembly = await this.assemblies.findById(
        orgId,
        selection.assemblyId,
      );
      if (!assembly) {
        throw new ServiceError(
          "BAD_REQUEST",
          `Assembly ${selection.assemblyId} does not exist`,
        );
      }
      chosen.push({
        assembly,
        driverValues: resolveDriverValues(assembly, selection.driverValues),
      });
    }

    // Load every referenced material once, across all chosen assemblies.
    const materialIds = new Set<string>();
    for (const { assembly } of chosen) {
      for (const line of assembly.lines) {
        if (line.kind === "material") {
          materialIds.add(line.materialId);
        }
      }
    }
    const materials = await this.materials.findByIds(orgId, [...materialIds]);
    const materialsById = new Map(
      materials.map((material) => [material.id, material]),
    );

    // Generate each assembly's lines in selection order.
    const lineItems: LineItemInput[] = [];
    const assemblies: EstimateAssembly[] = [];
    for (const { assembly, driverValues } of chosen) {
      const generated = generateAssemblyLines(
        { assembly, driverValues },
        materialsById,
        settings,
      );
      lineItems.push(...generated);
      assemblies.push({
        assemblyId: assembly.id,
        name: assembly.name,
        driverValues,
      });
    }

    const updated = await this.estimates.replaceSnapshot(orgId, id, {
      assemblies,
      lineItems,
      overheadRate: settings.overheadRate,
      profitRate: settings.profitRate,
      taxRate: settings.taxRate,
    });
    return this.requireView(updated);
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.estimates.deleteById(orgId, id);
  }

  private requireView(estimate: Estimate | null): EstimateView {
    if (!estimate) {
      throw new ServiceError("NOT_FOUND", "Estimate not found");
    }
    return computeEstimate(estimate);
  }
}
