import { inject, injectable } from "tsyringe";
import {
  ASSEMBLY_REPOSITORY_TOKEN,
  MATERIAL_REPOSITORY_TOKEN,
} from "@landscape/platform";
import type {
  Material,
  MaterialInput,
  MaterialRepository,
} from "@landscape/platform";
import type { AssemblyRepository } from "@landscape/platform";
import { ServiceError } from "../errors.ts";
import type { MaterialService } from "./MaterialService.ts";

/**
 * Material catalog rules: trim input on write, and guard deletion — a material
 * referenced by any assembly line is in use and can't be removed, so the
 * generated estimates that depend on it never lose their price. Injects the
 * assembly repository to enforce that, so this is orchestration, not a
 * passthrough.
 */
@injectable()
export class MaterialServiceImpl implements MaterialService {
  constructor(
    @inject(MATERIAL_REPOSITORY_TOKEN)
    private readonly materials: MaterialRepository,
    @inject(ASSEMBLY_REPOSITORY_TOKEN)
    private readonly assemblies: AssemblyRepository,
  ) {}

  list(orgId: string): Promise<Material[]> {
    return this.materials.findByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<Material | null> {
    return this.materials.findById(orgId, id);
  }

  create(orgId: string, input: MaterialInput): Promise<Material> {
    return this.materials.create(orgId, normalize(input));
  }

  async update(
    orgId: string,
    id: string,
    input: MaterialInput,
  ): Promise<Material> {
    const updated = await this.materials.update(orgId, id, normalize(input));
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Material not found");
    }
    return updated;
  }

  async remove(orgId: string, id: string): Promise<void> {
    const assemblies = await this.assemblies.findByOrg(orgId);
    const referencing = assemblies.filter((assembly) =>
      assembly.lines.some(
        (line) => line.kind === "material" && line.materialId === id,
      ),
    );
    if (referencing.length > 0) {
      const names = referencing.map((assembly) => assembly.name).join(", ");
      throw new ServiceError(
        "CONFLICT",
        `Material is used by assembly: ${names}. Remove those lines first.`,
      );
    }
    await this.materials.deleteById(orgId, id);
  }
}

function normalize(input: MaterialInput): MaterialInput {
  return {
    name: input.name.trim(),
    category: input.category.trim() || "General",
    unit: input.unit.trim(),
    unitPrice: input.unitPrice,
    deliveryCost: input.deliveryCost,
    taxable: input.taxable,
    active: input.active,
  };
}
