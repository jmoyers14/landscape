import type { MaterialInput } from "../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import type {
  AssemblyInput,
  LaborAssemblyLine,
  MaterialAssemblyLine,
} from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";

/**
 * A seed material paired with a stable `slug`. Slugs let an assembly reference
 * its materials before the database assigns ids — `seedOrg` inserts materials
 * first, then builds assemblies against the resulting slug→id map. Slugs are
 * globally unique across the starter catalog (section-prefixed), so the same
 * physical item at different prices in different sections stays distinct.
 */
export interface SeedMaterial {
  slug: string;
  input: MaterialInput;
}

/** One assembly in the starter catalog: its materials + how to build it. */
export interface SeedAssembly {
  materials: SeedMaterial[];
  build: (materialIdBySlug: Record<string, string>) => AssemblyInput;
}

interface SeedMaterialOptions {
  deliveryCost?: number;
  taxable?: boolean;
}

/** Builds a SeedMaterial; category is the section name, price/unit from the sheet. */
export function seedMaterial(
  category: string,
  slug: string,
  name: string,
  unit: string,
  unitPrice: number,
  options: SeedMaterialOptions = {},
): SeedMaterial {
  return {
    slug,
    input: {
      name,
      category,
      unit,
      unitPrice,
      deliveryCost: options.deliveryCost ?? 0,
      taxable: options.taxable ?? true,
      active: true,
    },
  };
}

/**
 * Resolves a slug to its database id, throwing a clear error if the seed map is
 * missing it (a transcription mistake) rather than producing a broken assembly.
 */
export function materialIdResolver(
  materialIdBySlug: Record<string, string>,
): (slug: string) => string {
  return (slug: string): string => {
    const value = materialIdBySlug[slug];
    if (!value) {
      throw new Error(`Seed: missing material id for slug "${slug}"`);
    }
    return value;
  };
}

// Line builders — keep the (long) assembly transcriptions terse and uniform.
// sortOrder is positional so the lines read in sheet order.

export function laborLine(
  sortOrder: number,
  key: string,
  description: string,
  quantityFormula: string,
  laborRateKey = "general",
): LaborAssemblyLine {
  return { key, kind: "labor", description, quantityFormula, laborRateKey, sortOrder };
}

interface MaterialLineOptions {
  // The labor line key this material is grouped under (its task). Omit for an
  // ungrouped material (rendered on its own, not nested under a task).
  groupKey?: string | null;
  deliveriesFormula?: string | null;
}

export function materialLine(
  sortOrder: number,
  key: string,
  description: string,
  quantityFormula: string,
  materialId: string,
  options: MaterialLineOptions = {},
): MaterialAssemblyLine {
  return {
    key,
    kind: "material",
    description,
    quantityFormula,
    materialId,
    deliveriesFormula: options.deliveriesFormula ?? null,
    groupKey: options.groupKey ?? null,
    sortOrder,
  };
}
