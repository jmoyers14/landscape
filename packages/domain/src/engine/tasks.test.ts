import { describe, expect, it } from "bun:test";
import { summarizeTasks } from "./tasks.ts";
import type { LineItemView } from "./calc.ts";

// A minimal priced line. `cost` is what the engine already computed for this
// line; summarizeTasks only ever sums it, never re-derives it.
function line(over: Partial<LineItemView> = {}): LineItemView {
  return {
    id: "li",
    phase: null,
    type: "material",
    description: "Line",
    quantity: 1,
    unit: "unit(s)",
    unitPrice: 10,
    taxable: false,
    deliveryCost: 0,
    quantityFormula: "1",
    sourceAssemblyId: "a1",
    sourceLineKey: null,
    taskKey: null,
    taskName: null,
    lineTotal: 10,
    cost: 10,
    ...over,
  };
}

describe("summarizeTasks", () => {
  it("groups lines by taskKey, at the position of each group's first line", () => {
    const blocks = summarizeTasks([
      line({ id: "a", taskKey: "t1", taskName: "Install valves" }),
      line({ id: "b", taskKey: "t2", taskName: "Trench" }),
      line({ id: "c", taskKey: "t1", taskName: "Install valves" }),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => (b.kind === "group" ? b.key : "loose"))).toEqual([
      "t1",
      "t2",
    ]);
    const first = blocks[0];
    if (first.kind !== "group") {
      throw new Error("expected a group");
    }
    expect(first.lines.map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("splits each task's money into material and labor, summing to its total", () => {
    const blocks = summarizeTasks([
      line({ id: "labor", taskKey: "t1", taskName: "Install valves", type: "labor", cost: 130.81 }),
      line({ id: "valves", taskKey: "t1", taskName: "Install valves", cost: 134.69 }),
      line({ id: "tape", taskKey: "t1", taskName: "Install valves", cost: 0.65 }),
    ]);

    expect(blocks).toHaveLength(1);
    const group = blocks[0];
    if (group.kind !== "group") {
      throw new Error("expected a group");
    }
    // The workbook's Q34 for this task: P34 + M35 + M36.
    expect(group.materialCost).toBeCloseTo(135.34, 8);
    expect(group.laborCost).toBeCloseTo(130.81, 8);
    expect(group.total).toBeCloseTo(266.15, 8);
    expect(group.materialCost + group.laborCost).toBeCloseTo(group.total, 10);
  });

  it("leaves lines with no taskKey loose, in place", () => {
    const blocks = summarizeTasks([
      line({ id: "loose1" }),
      line({ id: "grouped", taskKey: "t1", taskName: "Trench" }),
      line({ id: "loose2" }),
    ]);

    expect(blocks.map((b) => b.kind)).toEqual(["loose", "group", "loose"]);
    const first = blocks[0];
    if (first.kind !== "loose") {
      throw new Error("expected a loose line");
    }
    expect(first.line.id).toBe("loose1");
  });

  it("falls back to the taskKey when a snapshot has no taskName", () => {
    const blocks = summarizeTasks([
      line({ taskKey: "installValves", taskName: null }),
    ]);

    const only = blocks[0];
    if (only.kind !== "group") {
      throw new Error("expected a group");
    }
    expect(only.name).toBe("installValves");
  });

  it("returns nothing for no lines", () => {
    expect(summarizeTasks([])).toEqual([]);
  });
});
