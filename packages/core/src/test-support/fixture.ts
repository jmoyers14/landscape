/**
 * Self-contained engine fixtures — plain core entities built from literals, with
 * no dependency on the api package. Deliberately DUPLICATED from the api's
 * test-support drainage fixture (and from src/seed): the engine is its own
 * package and its tests assert against fixed, known data of their own. The
 * numbers below are the values the source spreadsheet's Drainage section
 * computes (drainageFt = 225).
 */
import type { Assembly } from "../types/assembly.ts";
import type { Estimate } from "../types/estimate.ts";
import type { Material } from "../types/material.ts";
import type { PricingSettings } from "../types/pricing.ts";

const CREATED_AT = "2026-01-01T00:00:00.000Z";

export const makeMaterial = (over: Partial<Material> = {}): Material => ({
  id: "material_1",
  name: "Test Material",
  category: "General",
  unit: "unit(s)",
  unitPrice: 1,
  deliveryCost: 0,
  taxable: true,
  active: true,
  createdAt: CREATED_AT,
  ...over,
});

export const makeAssembly = (over: Partial<Assembly> = {}): Assembly => ({
  id: "assembly_1",
  name: "Test Assembly",
  category: "General",
  description: null,
  sortOrder: 0,
  active: true,
  source: "custom",
  drivers: [{ key: "qty", label: "Quantity", unit: "unit(s)", defaultValue: 1 }],
  lines: [],
  createdAt: CREATED_AT,
  ...over,
});

export const makePricingSettings = (
  over: Partial<PricingSettings> = {},
): PricingSettings => ({
  taxRate: 7.75,
  overheadRate: 40,
  profitRate: 15,
  laborRates: [
    { key: "general", label: "General labor", rate: 35 },
    { key: "skilled", label: "Skilled labor", rate: 55 },
  ],
  ...over,
});

export const makeEstimate = (over: Partial<Estimate> = {}): Estimate => ({
  id: "estimate_1",
  projectId: "project_1",
  title: "Estimate",
  status: "draft",
  overheadRate: 40,
  profitRate: 15,
  taxRate: 0,
  assemblies: [],
  lineItems: [],
  createdAt: CREATED_AT,
  ...over,
});

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
        groupKey: "install",
        sortOrder: 3,
      },
      {
        key: "catchBasinDouble",
        kind: "material",
        description: "Double outlet catch basin",
        quantityFormula: "round((drainageFt / 85) * 2)",
        materialId: "catch-basin-double",
        deliveriesFormula: null,
        groupKey: "install",
        sortOrder: 4,
      },
      {
        key: "solidPipe3",
        kind: "material",
        description: 'Solid drain pipe 3" x 10\'',
        quantityFormula: "roundUp(drainageFt / 10)",
        materialId: "solid-pipe-3",
        deliveriesFormula: null,
        groupKey: "install",
        sortOrder: 5,
      },
      {
        key: "solidPipe6",
        kind: "material",
        description: 'Solid drain pipe 6" x 10\'',
        quantityFormula: "round((drainageFt / 150) * 1, 1)",
        materialId: "solid-pipe-6",
        deliveriesFormula: null,
        groupKey: "install",
        sortOrder: 6,
      },
      {
        key: "curbCore",
        kind: "material",
        description: "Curb core",
        quantityFormula: "drainageFt < 175 ? 1 : 2",
        materialId: "curb-core",
        deliveriesFormula: null,
        groupKey: "install",
        sortOrder: 7,
      },
    ],
  });
