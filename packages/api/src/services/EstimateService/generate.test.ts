import { describe, expect, it } from "bun:test";
import type { Assembly } from "../../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type { Material } from "../../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import type { PricingSettings } from "../../data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";
import { FormulaError, evaluate, resolveQuantities } from "./formula.ts";
import { generateAssemblyLines, priceLineItems } from "./generate.ts";

const settings: PricingSettings = {
  taxRate: 7.75,
  overheadRate: 40,
  profitRate: 15,
  laborRates: [
    { key: "general", label: "General labor", rate: 35 },
    { key: "skilled", label: "Skilled labor", rate: 55 },
  ],
};

// A material with sane defaults; override per case.
const material = (id: string, over: Partial<Material> = {}): Material => ({
  id,
  name: id,
  category: "Drainage",
  unit: "unit(s)",
  unitPrice: 0,
  deliveryCost: 0,
  taxable: true,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

// The Drainage section from "Package", driven by drainageFt = 225. Quantities,
// unit prices, and the per-line material total below are the values the
// spreadsheet itself computes (cells E11/E12/E21/E22/E25, M11, N9/P9).
const materials = new Map<string, Material>([
  ["catch-basin-single", material("catch-basin-single", { unitPrice: 6.853 })],
  ["catch-basin-double", material("catch-basin-double", { unitPrice: 6.853 })],
  ["solid-pipe-3", material("solid-pipe-3", { unitPrice: 4.13, unit: "pcs." })],
  [
    "solid-pipe-6",
    material("solid-pipe-6", { unitPrice: 13.94, unit: "pcs." }),
  ],
  ["curb-core", material("curb-core", { unitPrice: 75, unit: "core" })],
]);

const drainage: Assembly = {
  id: "drainage",
  name: "Drainage",
  category: "Drainage",
  description: null,
  sortOrder: 1,
  active: true,
  source: "starter",
  createdAt: "2026-01-01T00:00:00.000Z",
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
      description: "Solid drain pipe 3\" x 10'",
      quantityFormula: "roundUp(drainageFt / 10)",
      materialId: "solid-pipe-3",
      deliveriesFormula: null,
      sortOrder: 5,
    },
    {
      key: "solidPipe6",
      kind: "material",
      description: "Solid drain pipe 6\" x 10'",
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
};

describe("generateAssemblyLines — fidelity to the spreadsheet", () => {
  const lines = generateAssemblyLines(
    { assembly: drainage, driverValues: { drainageFt: 225 } },
    materials,
    settings,
  );
  const byKey = (key: string) => lines.find((l) => l.sourceLineKey === key)!;

  it("resolves material quantities exactly as the sheet does", () => {
    expect(byKey("catchBasinSingle").quantity).toBe(3); // E11 =ROUND(225/85,0)
    expect(byKey("catchBasinDouble").quantity).toBe(5); // E12 =ROUND(225/85*2,0)
    expect(byKey("solidPipe3").quantity).toBe(23); // E21 =ROUNDUP(225/10,0)
    expect(byKey("solidPipe6").quantity).toBe(1.5); // E22 =ROUND(225/150,1)
    expect(byKey("curbCore").quantity).toBe(2); // E25 =IF(225<175,1,2)
  });

  it("resolves labor hours and applies the right hourly rate", () => {
    expect(byKey("layout").quantity).toBeCloseTo(21.375, 5); // N9 =0.095*225
    expect(byKey("layout").unitPrice).toBe(35);
    expect(byKey("install").quantity).toBeCloseTo(11.86425, 5); // N10 =0.05273*225
  });

  it("freezes the source formula on each generated line", () => {
    expect(byKey("catchBasinSingle").quantityFormula).toBe(
      "round(drainageFt / 85)",
    );
  });
});

describe("priceLineItems — cost buildup", () => {
  it("taxes material lines before markup, matching the sheet's M11", () => {
    const lines = generateAssemblyLines(
      { assembly: drainage, driverValues: { drainageFt: 225 } },
      materials,
      settings,
    );
    // M11 in the sheet: 3 × 6.853 = 20.559, +7.75% tax = 22.1523225
    const single = lines.find((l) => l.sourceLineKey === "catchBasinSingle")!;
    const base = single.quantity * single.unitPrice;
    const withTax = base * (1 + settings.taxRate / 100);
    expect(withTax).toBeCloseTo(22.1523225, 5);
  });

  it("applies margin-basis overhead and profit on cost+overhead", () => {
    const totals = priceLineItems(
      [
        {
          phase: "T",
          type: "material",
          description: "m",
          quantity: 3,
          unit: "ea",
          unitPrice: 6.853,
          taxable: true,
          deliveryCost: 0,
          quantityFormula: "3",
          sourceAssemblyId: null,
          sourceLineKey: "m",
        },
        {
          phase: "T",
          type: "labor",
          description: "l",
          quantity: 21.375,
          unit: "hr",
          unitPrice: 35,
          taxable: false,
          deliveryCost: 0,
          quantityFormula: "21.375",
          sourceAssemblyId: null,
          sourceLineKey: "l",
        },
      ],
      settings,
    );
    // labor untaxed: 748.125; material taxed: 22.1523225
    expect(totals.laborCost).toBeCloseTo(748.125, 5);
    expect(totals.directCost).toBeCloseTo(770.2773225, 5);
    // overhead = cost/0.6 - cost
    expect(totals.directCost + totals.overhead).toBeCloseTo(
      totals.directCost / 0.6,
      5,
    );
    expect(totals.profit).toBeCloseTo(
      (totals.directCost + totals.overhead) * 0.15,
      5,
    );
  });
});

describe("formula engine robustness", () => {
  it("resolves chained line references in dependency order", () => {
    // sprayHeads = zones*16; popUps = round(sprayHeads*2/3) — the irrigation chain
    const resolved = resolveQuantities(
      [
        { key: "popUps", quantityFormula: "round(sprayHeads * 2 / 3)" },
        { key: "sprayHeads", quantityFormula: "valveZones * 16" },
      ],
      { valveZones: 5 },
    );
    expect(resolved.get("sprayHeads")).toBe(80);
    expect(resolved.get("popUps")).toBe(53);
  });

  it("rejects an unknown variable", () => {
    expect(() => evaluate("nope * 2", { drainageFt: 1 })).toThrow(FormulaError);
  });

  it("rejects a reference cycle", () => {
    expect(() =>
      resolveQuantities(
        [
          { key: "a", quantityFormula: "b + 1" },
          { key: "b", quantityFormula: "a + 1" },
        ],
        {},
      ),
    ).toThrow(FormulaError);
  });

  it("does not resolve JS globals (sandbox)", () => {
    expect(() => evaluate("process", {})).toThrow(FormulaError);
  });
});
