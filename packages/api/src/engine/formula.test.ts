import { describe, expect, it } from "bun:test";
import {
  FormulaError,
  assertReferencesKnown,
  evaluate,
  resolveQuantities,
  validateLineFormulas,
} from "./formula.ts";

describe("resolveQuantities", () => {
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
});

describe("evaluate", () => {
  it("rejects an unknown variable", () => {
    expect(() => evaluate("nope * 2", { drainageFt: 1 })).toThrow(FormulaError);
  });

  it("does not resolve JS globals (sandbox)", () => {
    expect(() => evaluate("process", {})).toThrow(FormulaError);
  });
});

describe("validateLineFormulas", () => {
  it("accepts a valid set of formulas referencing drivers and other lines", () => {
    expect(() =>
      validateLineFormulas(
        [
          { key: "heads", quantityFormula: "valveZones * 16" },
          { key: "popUps", quantityFormula: "round(heads * 2 / 3)" },
        ],
        ["valveZones"],
      ),
    ).not.toThrow();
  });

  it("validates structure without evaluating (a div-by-zero formula is fine)", () => {
    // Default driver values can be 0; validation must not evaluate and reject this.
    expect(() =>
      validateLineFormulas([{ key: "a", quantityFormula: "x / 0" }], ["x"]),
    ).not.toThrow();
  });

  it("rejects an unknown variable", () => {
    expect(() =>
      validateLineFormulas([{ key: "a", quantityFormula: "nope + 1" }], ["x"]),
    ).toThrow(FormulaError);
  });

  it("rejects a reference cycle", () => {
    expect(() =>
      validateLineFormulas(
        [
          { key: "a", quantityFormula: "b + 1" },
          { key: "b", quantityFormula: "a + 1" },
        ],
        [],
      ),
    ).toThrow(FormulaError);
  });
});

describe("assertReferencesKnown", () => {
  it("accepts a formula referencing only allowed keys", () => {
    expect(() =>
      assertReferencesKnown("drainageFt / 2", ["drainageFt"]),
    ).not.toThrow();
  });

  it("rejects a formula referencing an unknown key", () => {
    expect(() =>
      assertReferencesKnown("nope / 2", ["drainageFt"]),
    ).toThrow(FormulaError);
  });
});
