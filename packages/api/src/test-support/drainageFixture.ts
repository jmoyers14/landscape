import type { Material } from "../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import type { Assembly } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type { PricingSettings } from "../data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";
import { makeAssembly, makeMaterial, makePricingSettings } from "./factories.ts";

/**
 * A self-contained Drainage fixture for tests — a representative subset of the
 * Package sheet's Drainage section (drainageFt = 225). Lives here, deliberately
 * DUPLICATED from src/seed/drainage.ts, so tests assert against fixed, known
 * data and never depend on the production seed. Material ids are stable strings
 * the assembly's lines reference directly.
 */

export const drainagePricing = (): PricingSettings => makePricingSettings();

export const drainageMaterials = (): Material[] => [
  makeMaterial({ id: "catch-basin-single", name: "Single outlet catch basin", category: "Drainage", unit: "unit(s)", unitPrice: 6.853 }),
  makeMaterial({ id: "catch-basin-double", name: "Double outlet catch basin", category: "Drainage", unit: "unit(s)", unitPrice: 6.853 }),
  makeMaterial({ id: "solid-pipe-3", name: 'Solid drain pipe 3" x 10\'', category: "Drainage", unit: "pcs.", unitPrice: 4.13 }),
  makeMaterial({ id: "solid-pipe-6", name: 'Solid drain pipe 6" x 10\'', category: "Drainage", unit: "pcs.", unitPrice: 13.94 }),
  makeMaterial({ id: "curb-core", name: "Curb core", category: "Drainage", unit: "core", unitPrice: 75 }),
];

export const drainageAssembly = (): Assembly =>
  makeAssembly({
    id: "drainage",
    name: "Drainage",
    category: "Drainage",
    sortOrder: 1,
    source: "starter",
    drivers: [
      { key: "drainageFt", label: "Drainage length", unit: "ft.", defaultValue: 225 },
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
        materialId: "catch-basin-single",
        deliveriesFormula: null,
        sortOrder: 3,
      },
      {
        key: "catchBasinDouble",
        kind: "material",
        description: "Double outlet catch basin",
        quantityFormula: "round((drainageFt / 85) * 2)",
        materialId: "catch-basin-double",
        deliveriesFormula: null,
        sortOrder: 4,
      },
      {
        key: "solidPipe3",
        kind: "material",
        description: 'Solid drain pipe 3" x 10\'',
        quantityFormula: "roundUp(drainageFt / 10)",
        materialId: "solid-pipe-3",
        deliveriesFormula: null,
        sortOrder: 5,
      },
      {
        key: "solidPipe6",
        kind: "material",
        description: 'Solid drain pipe 6" x 10\'',
        quantityFormula: "round((drainageFt / 150) * 1, 1)",
        materialId: "solid-pipe-6",
        deliveriesFormula: null,
        sortOrder: 6,
      },
      {
        key: "curbCore",
        kind: "material",
        description: "Curb core",
        quantityFormula: "drainageFt < 175 ? 1 : 2",
        materialId: "curb-core",
        deliveriesFormula: null,
        sortOrder: 7,
      },
    ],
  });
