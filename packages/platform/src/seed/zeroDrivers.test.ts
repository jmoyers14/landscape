import { describe, expect, it } from "bun:test";
import type { Material } from "@landscape/domain";
import { generateAssemblyLines, priceLines } from "@landscape/domain";
import { STARTER_ASSEMBLIES } from "./catalog.ts";
import { STARTER_PRICING } from "./pricing.ts";
import type { SeedAssembly } from "./types.ts";

/**
 * Regression lock for the fact that drives `EstimateServiceImpl.create`'s
 * design: the starter catalog does NOT price to zero at all-zero drivers. The
 * source workbook's quantity formulas carry constants, conditionals, and
 * offsets that don't depend on any driver (12 tree stakes, a curb core, half a
 * yard of concrete, ...), so running the engine at zero would put real money
 * on a brand-new, untouched estimate. That's why `create` stores an empty
 * line-item snapshot instead of generating one — see the comment on `create`
 * in packages/api/src/services/EstimateService/EstimateServiceImpl.ts.
 *
 * This is catalog.test.ts's companion at zero drivers rather than defaults;
 * catalog.test.ts is a frozen fidelity lock and is not touched here.
 */

// Prices the assembly with a slug-identity material map (no DB), at every
// driver forced to zero — the same inputs `create` would seed a new estimate
// with.
function runAssembly(seed: SeedAssembly) {
  const idMap = Object.fromEntries(seed.materials.map((m) => [m.slug, m.slug]));
  const built = seed.build(idMap);
  // build() returns an AssemblyInput; the engine wants a persisted Assembly.
  const assembly = { ...built, id: built.name, createdAt: "" };
  const materialsById = new Map<string, Material>(
    seed.materials.map((m) => [
      m.slug,
      { id: m.slug, createdAt: "", ...m.input },
    ]),
  );
  const driverValues = Object.fromEntries(
    assembly.drivers.map((d) => [d.key, 0]),
  );
  const lines = generateAssemblyLines(
    { assembly, driverValues },
    materialsById,
    STARTER_PRICING,
  );
  return {
    name: assembly.name,
    totals: priceLines(lines, STARTER_PRICING),
  };
}

const RESULTS = STARTER_ASSEMBLIES.map(runAssembly);

function totalFor(name: string): number {
  const result = RESULTS.find((r) => r.name === name);
  expect(result, `no zero-driver result for "${name}"`).toBeDefined();
  return result!.totals.total;
}

describe("starter catalog — pricing at zero drivers", () => {
  it("Soil Preparation totals exactly zero — it has no driver-independent lines", () => {
    expect(totalFor("Soil Preparation")).toBe(0);
  });

  // Drainage: curbCore's quantity is `drainageFt < 175 ? 1 : 2`, which is 1
  // (not 0) when drainageFt is 0.
  it("Drainage totals more than zero — the curb core bills 1 unit even at zero feet", () => {
    expect(totalFor("Drainage")).toBeGreaterThan(0);
  });

  // Irrigation: funnyPipe's quantity formula is the constant `1`.
  it("Irrigation totals more than zero — funnyPipe always bills 1 unit", () => {
    expect(totalFor("Irrigation")).toBeGreaterThan(0);
  });

  // Planting: treeStakes' quantity formula is the constant `12`, and cinchTies
  // is `treeStakes * 4`, so it bills 48 even with zero trees.
  it("Planting totals more than zero — 12 tree stakes and 48 cinch ties bill regardless of tree count", () => {
    expect(totalFor("Planting")).toBeGreaterThan(0);
  });

  // Concrete: yards' quantity formula is `((slabArea * (4/12)) / 27) + 0.5`,
  // which floors at 0.5 yards — and that non-zero quantity also triggers the
  // $250 concrete-pump delivery charge (the zero-quantity delivery fix only
  // suppresses delivery when quantity is truly 0).
  it("Concrete totals more than zero — half a yard of concrete bills even at zero slab area, plus its pump delivery", () => {
    expect(totalFor("Concrete")).toBeGreaterThan(0);
  });

  // Seating Wall: column6x8Footing's quantity formula is the constant `2`.
  // (dobies goes negative at zero wallLength — out of scope, see seatingWall.ts.)
  it("Seating Wall totals more than zero — the footing always bills 2 columns", () => {
    expect(totalFor("Seating Wall")).toBeGreaterThan(0);
  });

  it("the catalog-wide total at zero drivers is well over a thousand dollars", () => {
    const catalogTotal = RESULTS.reduce(
      (sum, result) => sum + result.totals.total,
      0,
    );
    // A coarse but honest bound: documents the magnitude (this is real money on
    // an untouched estimate, not a rounding artifact) without pinning a figure
    // that would churn every time a material price changes.
    expect(catalogTotal).toBeGreaterThan(1000);
  });
});
