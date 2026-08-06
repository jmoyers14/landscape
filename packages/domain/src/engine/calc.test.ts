import { describe, expect, it } from "bun:test";
import { computeEstimate, priceLines } from "./calc.ts";
import { generateAssemblyLines } from "./generate.ts";
import {
  drainageAssembly,
  drainageMaterials,
  drainagePricing,
  makeEstimate,
} from "../test-support/fixture.ts";
import type { LineItem } from "../types/estimate.ts";

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

  it("applies overhead to materials only, never to labor", () => {
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
    expect(totals.materialCost).toBeCloseTo(22.1523225, 5);
    expect(totals.laborCost).toBeCloseTo(748.125, 5);
    expect(totals.directCost).toBeCloseTo(770.2773225, 5);
    // the sheet grosses up MATERIALS only: 22.1523225 / 0.6 - 22.1523225
    expect(totals.overhead).toBeCloseTo(14.768215, 5);
    expect(totals.materialCost + totals.overhead).toBeCloseTo(
      totals.materialCost / 0.6,
      5,
    );
    // profit is unchanged: it still applies to cost + overhead
    expect(totals.profit).toBeCloseTo(117.7568306, 5);
    expect(totals.total).toBeCloseTo(902.8023681, 5);
  });

  it("charges no overhead at all on a labor-only buildup", () => {
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
    expect(totals.overhead).toBe(0);
    expect(totals.profit).toBeCloseTo(75, 5); // 500 × 0.15
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
      assemblies: [
        {
          assemblyId: "drainage",
          name: "Drainage",
          driverValues: { drainageFt: 225 },
        },
      ],
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
          taskKey: "install",
          taskName: "Installing pipe, basins, grates",
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
          taskKey: "layout",
          taskName: "Lay out, trenching, and back filling",
        },
      ],
    });

    const view = computeEstimate(estimate);

    // lineTotal is the pre-tax base; cost is the direct-cost contribution
    expect(view.lineItems[0].lineTotal).toBeCloseTo(20.559, 5);
    expect(view.lineItems[0].cost).toBeCloseTo(22.1523225, 5); // base + 7.75% tax
    expect(view.lineItems[1].cost).toBeCloseTo(748.125, 5); // labor, untaxed
    // totals match the faithful buildup (same as priceLines above)
    expect(view.totals.directCost).toBeCloseTo(770.2773225, 5);
    expect(view.totals.total).toBeGreaterThan(view.totals.directCost);
    // one assembly, carrying its own full buildup
    expect(view.assemblyTotals).toHaveLength(1);
    expect(view.assemblyTotals[0].assemblyId).toBe("drainage");
    expect(view.assemblyTotals[0].name).toBe("Drainage");
    expect(view.assemblyTotals[0].directCost).toBeCloseTo(770.2773225, 5);
    expect(view.assemblyTotals[0].total).toBeCloseTo(view.totals.total, 5);
  });

  it("per-assembly totals sum exactly to the estimate totals", () => {
    const line = (
      id: string,
      assemblyId: string,
      over: Partial<LineItem> = {},
    ): LineItem => ({
      id,
      phase: assemblyId,
      type: "material",
      description: "Line",
      quantity: 3,
      unit: "unit(s)",
      unitPrice: 6.853,
      taxable: true,
      deliveryCost: 0,
      quantityFormula: "1",
      sourceAssemblyId: assemblyId,
      sourceLineKey: id,
      taskKey: null,
      taskName: null,
      ...over,
    });

    const view = computeEstimate(
      makeEstimate({
        overheadRate: 40,
        profitRate: 15,
        taxRate: 7.75,
        assemblies: [
          { assemblyId: "a1", name: "Drainage", driverValues: {} },
          { assemblyId: "a2", name: "Irrigation", driverValues: {} },
        ],
        lineItems: [
          line("li_1", "a1"),
          line("li_2", "a1", {
            type: "labor",
            quantity: 21.375,
            unitPrice: 35,
            taxable: false,
          }),
          line("li_3", "a2", { quantity: 7, unitPrice: 12.5 }),
          line("li_4", "a2", {
            type: "labor",
            quantity: 4,
            unitPrice: 55,
            taxable: false,
          }),
        ],
      }),
    );

    expect(view.assemblyTotals).toHaveLength(2);
    expect(view.assemblyTotals.map((a) => a.name)).toEqual([
      "Drainage",
      "Irrigation",
    ]);

    // Both overhead and profit are linear in their bases, so the parts sum to
    // the whole with no rounding reconciliation. This is the property that lets
    // the UI show per-assembly money without a fudge line.
    const sum = (pick: (a: (typeof view.assemblyTotals)[number]) => number) =>
      view.assemblyTotals.reduce((acc, a) => acc + pick(a), 0);
    expect(sum((a) => a.materialCost)).toBeCloseTo(view.totals.materialCost, 8);
    expect(sum((a) => a.laborCost)).toBeCloseTo(view.totals.laborCost, 8);
    expect(sum((a) => a.overhead)).toBeCloseTo(view.totals.overhead, 8);
    expect(sum((a) => a.profit)).toBeCloseTo(view.totals.profit, 8);
    expect(sum((a) => a.total)).toBeCloseTo(view.totals.total, 8);
  });

  it("groups lines with no source assembly under their own block", () => {
    const view = computeEstimate(
      makeEstimate({
        taxRate: 0,
        assemblies: [],
        lineItems: [
          {
            id: "li_loose",
            phase: null,
            type: "material",
            description: "Hand-added line",
            quantity: 2,
            unit: "unit(s)",
            unitPrice: 10,
            taxable: false,
            deliveryCost: 0,
            quantityFormula: "2",
            sourceAssemblyId: null,
            sourceLineKey: null,
            taskKey: null,
            taskName: null,
          },
        ],
      }),
    );

    expect(view.assemblyTotals).toHaveLength(1);
    expect(view.assemblyTotals[0].assemblyId).toBeNull();
    expect(view.assemblyTotals[0].name).toBe("Other");
    expect(view.assemblyTotals[0].total).toBeCloseTo(view.totals.total, 8);
  });

  it("falls back to a placeholder name for a line whose assembly id no longer resolves", () => {
    const view = computeEstimate(
      makeEstimate({
        taxRate: 0,
        assemblies: [],
        lineItems: [
          {
            id: "li_orphan",
            phase: "Deleted Assembly",
            type: "material",
            description: "Orphaned line",
            quantity: 2,
            unit: "unit(s)",
            unitPrice: 10,
            taxable: false,
            deliveryCost: 0,
            quantityFormula: "2",
            sourceAssemblyId: "deleted-assembly",
            sourceLineKey: "li_orphan",
            taskKey: null,
            taskName: null,
          },
        ],
      }),
    );

    expect(view.assemblyTotals).toHaveLength(1);
    expect(view.assemblyTotals[0].assemblyId).toBe("deleted-assembly");
    expect(view.assemblyTotals[0].name).toBe("Unknown assembly");
    expect(view.assemblyTotals[0].total).toBeCloseTo(view.totals.total, 8);
  });
});

describe("priceLines — material / labor split", () => {
  const rates = { taxRate: 7.75, overheadRate: 40, profitRate: 15 };

  it("splits profit and total the way the sheet's M and P columns do", () => {
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
      rates,
    );

    // materials 3 × 6.853 = 20.559, +7.75% tax  = 22.1523225
    // overhead  22.1523225 × (1/0.6 − 1)        = 14.768215
    // labor     21.375 × 35                     = 748.125
    expect(totals.materialProfit).toBeCloseTo(5.538080625, 8);
    expect(totals.laborProfit).toBeCloseTo(112.21875, 8);
    expect(totals.materialTotal).toBeCloseTo(42.458618125, 8);
    expect(totals.laborTotal).toBeCloseTo(860.34375, 8);
  });

  it("the two columns sum to the combined figures exactly", () => {
    const totals = priceLines(
      [
        {
          type: "material",
          quantity: 7,
          unitPrice: 12.5,
          taxable: true,
          deliveryCost: 4.25,
        },
        {
          type: "labor",
          quantity: 4,
          unitPrice: 55,
          taxable: false,
          deliveryCost: 0,
        },
      ],
      rates,
    );

    // Both quantities are linear in their bases, so the parts sum to the whole
    // with nothing left over. This is what lets the UI show two columns without
    // a reconciling line.
    //
    // NOTE: this can't fail today — calc.ts defines `profit`/`total` as
    // exactly these sums, so it's true by construction, not by coincidence.
    // It's documentation of that invariant, not coverage of it. Keep it
    // anyway: it guards against a future refactor that re-derives profit/
    // total independently instead of summing the two columns.
    expect(totals.materialProfit + totals.laborProfit).toBeCloseTo(
      totals.profit,
      10,
    );
    expect(totals.materialTotal + totals.laborTotal).toBeCloseTo(
      totals.total,
      10,
    );
  });

  it("gives a labor-only estimate an empty material column", () => {
    const totals = priceLines(
      [
        {
          type: "labor",
          quantity: 10,
          unitPrice: 35,
          taxable: false,
          deliveryCost: 0,
        },
      ],
      rates,
    );

    expect(totals.overhead).toBe(0);
    expect(totals.materialProfit).toBe(0);
    expect(totals.materialTotal).toBe(0);
    expect(totals.laborTotal).toBeCloseTo(402.5, 8);
    expect(totals.total).toBeCloseTo(402.5, 8);
  });
});
