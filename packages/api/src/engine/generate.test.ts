import { describe, expect, it } from "bun:test";
import { generateAssemblyLines, priceLineItems } from "./generate.ts";
import {
  drainageAssembly,
  drainageMaterials,
  drainagePricing,
} from "../test-support/drainageFixture.ts";

// The Drainage subset (drainageFt = 225). Quantities, prices, and the per-line
// material total asserted below are the values the spreadsheet itself computes
// (cells E11/E12/E21/E22/E25, M11, N9/P9).
const settings = drainagePricing();
const materials = new Map(drainageMaterials().map((m) => [m.id, m]));
const drainage = drainageAssembly();

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
