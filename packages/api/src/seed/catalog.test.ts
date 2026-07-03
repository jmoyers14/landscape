import { describe, expect, it } from "bun:test";
import type { Material } from "../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import { generateAssemblyLines, priceLines } from "@landscape/core";
import { STARTER_ASSEMBLIES } from "./catalog.ts";
import { STARTER_PRICING } from "./pricing.ts";
import type { SeedAssembly } from "./types.ts";

/**
 * Seed-correctness test: each starter assembly, run through the engine with its
 * default drivers, must reproduce the figures the source spreadsheet's Package
 * sheet computes. This is the regression guard for the Phase D transcription —
 * if a formula or price drifts from the workbook, a number below stops matching.
 *
 * It deliberately imports the production seed (the system under test). The fixed
 * anchors are the spreadsheet's own values, not seed data used as a fixture.
 *
 * Expected `materialCost` is the section's M-column total. NOTE: Irrigation's is
 * the CORRECTED sum — the sheet's own SUM(M35:M51) is buggy and drops its last
 * three material rows; we include them.
 */
const EXPECTED: Record<string, { materialCost: number; laborHours: number }> = {
  Drainage: { materialCost: 466.34900375, laborHours: 33.23925 },
  Irrigation: { materialCost: 1142.31378, laborHours: 69.3695 },
  "Soil Preparation": { materialCost: 608.7875, laborHours: 35.16 },
  Planting: { materialCost: 4113.464295, laborHours: 80.0424 },
  // Concrete's material total (M127) and labor hours (N130) EXCLUDE the omitted
  // "Finishers" flat fee, which lives only in the sheet's labor-$ total (P127).
  Concrete: { materialCost: 5159.3210139444445, laborHours: 113.12452901234568 },
  "Seating Wall": { materialCost: 515.9567125, laborHours: 37.18225 },
};

// Prices the assembly with a slug-identity material map (no DB), at its driver
// defaults — the same inputs the seed would resolve against the catalog.
function runAssembly(seed: SeedAssembly) {
  const idMap = Object.fromEntries(seed.materials.map((m) => [m.slug, m.slug]));
  const built = seed.build(idMap);
  // build() returns an AssemblyInput; the engine wants a persisted Assembly.
  const assembly = { ...built, id: built.name, createdAt: "" };
  const materialsById = new Map<string, Material>(
    seed.materials.map((m) => [m.slug, { id: m.slug, createdAt: "", ...m.input }]),
  );
  const driverValues = Object.fromEntries(
    assembly.drivers.map((d) => [d.key, d.defaultValue]),
  );
  const lines = generateAssemblyLines(
    { assembly, driverValues },
    materialsById,
    STARTER_PRICING,
  );
  const laborHours = lines
    .filter((line) => line.type === "labor")
    .reduce((sum, line) => sum + line.quantity, 0);
  return { name: assembly.name, totals: priceLines(lines, STARTER_PRICING), laborHours };
}

describe("starter catalog — fidelity to the Package sheet", () => {
  for (const seed of STARTER_ASSEMBLIES) {
    const { name, totals, laborHours } = runAssembly(seed);

    it(`${name} reproduces the sheet's material total and labor hours`, () => {
      const expected = EXPECTED[name];
      // Every registered assembly must have an expected figure, so adding one
      // without transcribing its sheet totals fails loudly here.
      expect(expected, `no expected fidelity figures for "${name}"`).toBeDefined();
      expect(totals.materialCost).toBeCloseTo(expected.materialCost, 3);
      expect(laborHours).toBeCloseTo(expected.laborHours, 3);
    });
  }
});
