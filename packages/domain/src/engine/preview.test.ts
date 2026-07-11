import { describe, expect, it } from "bun:test";
import { computeEstimate } from "./calc.ts";
import { previewEstimate } from "./preview.ts";
import {
  drainageAssembly,
  drainageMaterials,
  drainagePricing,
  makeEstimate,
} from "../test-support/fixture.ts";

const context = {
  assemblies: [drainageAssembly()],
  materials: drainageMaterials(),
  pricing: drainagePricing(),
};

describe("previewEstimate", () => {
  it("prices a selection at its driver defaults", () => {
    const view = previewEstimate([{ assemblyId: "drainage" }], context);
    // drainageFt defaults to 225 -> catch basin quantity round(225/85) = 3
    const single = view.lineItems.find(
      (l) => l.sourceLineKey === "catchBasinSingle",
    )!;
    expect(single.quantity).toBe(3);
    expect(view.totals.directCost).toBeGreaterThan(0);
    expect(view.assemblies[0].driverValues.drainageFt).toBe(225);
  });

  it("recomputes when a driver value changes", () => {
    const base = previewEstimate([{ assemblyId: "drainage" }], context);
    const more = previewEstimate(
      [{ assemblyId: "drainage", driverValues: { drainageFt: 450 } }],
      context,
    );
    expect(more.totals.total).toBeGreaterThan(base.totals.total);
    const single = more.lineItems.find(
      (l) => l.sourceLineKey === "catchBasinSingle",
    )!;
    expect(single.quantity).toBe(5); // round(450/85)
  });

  it("ignores driver values for keys that aren't real drivers", () => {
    const view = previewEstimate(
      [{ assemblyId: "drainage", driverValues: { bogus: 9999 } }],
      context,
    );
    expect(view.assemblies[0].driverValues).toEqual({ drainageFt: 225 });
  });

  it("skips selections whose assembly isn't in the context", () => {
    const view = previewEstimate([{ assemblyId: "missing" }], context);
    expect(view.lineItems).toHaveLength(0);
    expect(view.totals.total).toBe(0);
  });

  it("matches what the server would compute from the saved snapshot", () => {
    // The whole point: previewing selections, then saving and re-pricing the
    // frozen snapshot, must agree. Mirror what setAssemblies persists.
    const view = previewEstimate([{ assemblyId: "drainage" }], context);
    const saved = makeEstimate({
      overheadRate: context.pricing.overheadRate,
      profitRate: context.pricing.profitRate,
      taxRate: context.pricing.taxRate,
      assemblies: view.assemblies,
      lineItems: view.lineItems.map(({ lineTotal, cost, ...item }) => item),
    });
    const serverView = computeEstimate(saved);
    expect(serverView.totals.total).toBeCloseTo(view.totals.total, 6);
  });
});
