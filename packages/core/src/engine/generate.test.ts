import { describe, expect, it } from "bun:test";
import { generateAssemblyLines } from "./generate.ts";
import {
  drainageAssembly,
  drainageMaterials,
  drainagePricing,
} from "../test-support/fixture.ts";

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
