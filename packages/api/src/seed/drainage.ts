import type { MaterialInput } from "../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import type { AssemblyInput } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type { PricingSettings } from "../data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";

/**
 * The Drainage starter catalog, transcribed from the source spreadsheet's
 * Package sheet. This is the representative subset used to prove the pipeline
 * (the full line list is Phase D). Prices/units/formulas are the sheet's.
 *
 * Materials are keyed by a stable `slug` so the assembly can reference them
 * before the database assigns ids — `seedOrg` inserts materials first, then
 * builds the assembly against the resulting id map.
 */

export interface SeedMaterial {
  slug: string;
  input: MaterialInput;
}

function seedMaterial(
  slug: string,
  name: string,
  unit: string,
  unitPrice: number,
): SeedMaterial {
  return {
    slug,
    input: {
      name,
      category: "Drainage",
      unit,
      unitPrice,
      deliveryCost: 0,
      taxable: true,
      active: true,
    },
  };
}

export const DRAINAGE_MATERIALS: SeedMaterial[] = [
  seedMaterial("catch-basin-single", "Single outlet catch basin", "unit(s)", 6.853),
  seedMaterial("catch-basin-double", "Double outlet catch basin", "unit(s)", 6.853),
  seedMaterial("solid-pipe-3", 'Solid drain pipe 3" x 10\'', "pcs.", 4.13),
  seedMaterial("solid-pipe-6", 'Solid drain pipe 6" x 10\'', "pcs.", 13.94),
  seedMaterial("curb-core", "Curb core", "core", 75),
];

export const DRAINAGE_PRICING: PricingSettings = {
  taxRate: 7.75,
  overheadRate: 40,
  profitRate: 15,
  laborRates: [
    { key: "general", label: "General labor", rate: 35 },
    { key: "skilled", label: "Skilled labor", rate: 55 },
  ],
};

/**
 * Builds the Drainage assembly, resolving each material line's slug to its real
 * id via the provided map. `source: "starter"` marks it as seeded (vs. authored
 * in-app).
 */
export function buildDrainageAssembly(
  materialIdBySlug: Record<string, string>,
): AssemblyInput {
  const materialId = (slug: string): string => {
    const value = materialIdBySlug[slug];
    if (!value) {
      throw new Error(`Seed: missing material id for slug "${slug}"`);
    }
    return value;
  };

  return {
    name: "Drainage",
    category: "Drainage",
    description: "Lay out, trench, and install drains and basins.",
    sortOrder: 1,
    active: true,
    source: "starter",
    drivers: [
      {
        key: "drainageFt",
        label: "Drainage length",
        unit: "ft.",
        defaultValue: 225,
      },
    ],
    lines: [
      {
        key: "layout",
        kind: "labor",
        description: "Lay out, trenching, and back filling",
        quantityFormula: "0.095 * drainageFt",
        laborRateKey: "general",
        sortOrder: 1,
      },
      {
        key: "install",
        kind: "labor",
        description: "Installing pipe, basins, grates",
        quantityFormula: "0.05273 * drainageFt",
        laborRateKey: "general",
        sortOrder: 2,
      },
      {
        key: "catchBasinSingle",
        kind: "material",
        description: "Single outlet catch basin",
        quantityFormula: "round(drainageFt / 85)",
        materialId: materialId("catch-basin-single"),
        deliveriesFormula: null,
        sortOrder: 3,
      },
      {
        key: "catchBasinDouble",
        kind: "material",
        description: "Double outlet catch basin",
        quantityFormula: "round((drainageFt / 85) * 2)",
        materialId: materialId("catch-basin-double"),
        deliveriesFormula: null,
        sortOrder: 4,
      },
      {
        key: "solidPipe3",
        kind: "material",
        description: 'Solid drain pipe 3" x 10\'',
        quantityFormula: "roundUp(drainageFt / 10)",
        materialId: materialId("solid-pipe-3"),
        deliveriesFormula: null,
        sortOrder: 5,
      },
      {
        key: "solidPipe6",
        kind: "material",
        description: 'Solid drain pipe 6" x 10\'',
        quantityFormula: "round((drainageFt / 150) * 1, 1)",
        materialId: materialId("solid-pipe-6"),
        deliveriesFormula: null,
        sortOrder: 6,
      },
      {
        key: "curbCore",
        kind: "material",
        description: "Curb core",
        quantityFormula: "drainageFt < 175 ? 1 : 2",
        materialId: materialId("curb-core"),
        deliveriesFormula: null,
        sortOrder: 7,
      },
    ],
  };
}
