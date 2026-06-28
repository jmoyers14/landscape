import { describe, expect, it } from "bun:test";
import { computeEstimate, priceLines } from "./calc.ts";
import { generateAssemblyLines } from "./generate.ts";
import {
  drainageAssembly,
  drainageMaterials,
  drainagePricing,
  makeEstimate,
} from "../test-support/fixture.ts";

const settings = drainagePricing();
const materials = new Map(drainageMaterials().map((m) => [m.id, m]));
const drainage = drainageAssembly();

describe("priceLines — cost buildup", () => {
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
    const totals = priceLines(
      [
        {
          type: "material",
          quantity: 3,
          unitPrice: 6.853,
          taxable: true,
          deliveryCost: 0,
        },
        {
          type: "labor",
          quantity: 21.375,
          unitPrice: 35,
          taxable: false,
          deliveryCost: 0,
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

  it("never taxes labor and reports zero tax for a labor-only buildup", () => {
    const totals = priceLines(
      [
        {
          type: "labor",
          quantity: 10,
          unitPrice: 50,
          taxable: false,
          deliveryCost: 0,
        },
      ],
      { taxRate: 7.75, overheadRate: 40, profitRate: 15 },
    );
    expect(totals.tax).toBe(0);
    expect(totals.materialCost).toBe(0);
    expect(totals.laborCost).toBe(500);
  });
});

describe("computeEstimate — pricing a stored snapshot", () => {
  it("prices the frozen line items with the estimate's own rates", () => {
    const estimate = makeEstimate({
      overheadRate: 40,
      profitRate: 15,
      taxRate: 7.75,
      lineItems: [
        {
          id: "li_1",
          phase: "Drainage",
          type: "material",
          description: "Catch basin",
          quantity: 3,
          unit: "unit(s)",
          unitPrice: 6.853,
          taxable: true,
          deliveryCost: 0,
          quantityFormula: "round(drainageFt / 85)",
          sourceAssemblyId: "drainage",
          sourceLineKey: "catchBasinSingle",
          groupKey: "layout",
        },
        {
          id: "li_2",
          phase: "Drainage",
          type: "labor",
          description: "Lay out",
          quantity: 21.375,
          unit: "hr",
          unitPrice: 35,
          taxable: false,
          deliveryCost: 0,
          quantityFormula: "0.095 * drainageFt",
          sourceAssemblyId: "drainage",
          sourceLineKey: "layout",
          groupKey: "layout",
        },
      ],
    });

    const view = computeEstimate(estimate);

    // lineTotal is the pre-tax base; cost is the direct-cost contribution
    expect(view.lineItems[0].lineTotal).toBeCloseTo(20.559, 5);
    expect(view.lineItems[0].cost).toBeCloseTo(22.1523225, 5); // base + 7.75% tax
    expect(view.lineItems[1].cost).toBeCloseTo(748.125, 5); // labor, untaxed
    // both lines roll up under one phase, on a direct-cost basis that ties out
    expect(view.phases).toHaveLength(1);
    expect(view.phases[0].phase).toBe("Drainage");
    expect(view.phases[0].subtotal).toBeCloseTo(770.2773225, 5);
    expect(view.phases[0].subtotal).toBeCloseTo(view.totals.directCost, 5);
    // totals match the faithful buildup (same as priceLines above)
    expect(view.totals.directCost).toBeCloseTo(770.2773225, 5);
    expect(view.totals.total).toBeGreaterThan(view.totals.directCost);
  });
});
