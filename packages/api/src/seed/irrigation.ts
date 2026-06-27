import type { AssemblyInput } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import {
  type SeedMaterial,
  laborLine,
  materialIdResolver,
  materialLine,
  seedMaterial,
} from "./types.ts";

/**
 * Irrigation, transcribed from the Package sheet (rows 34–54), driver `valves`
 * = $E$34 = 5.
 *
 * The sheet has a derived quantity $E$40 = $E$34 * 16 (lateral "zone" units)
 * that many lateral materials key off; we inline it as `(valves * 16)`. Lines
 * that reference another line (shrub bodies = pop-up bodies, funny elbows =
 * pop-up bodies × 2) reference the `popupBody` line key directly. We omit the
 * sheet's row 42 ("3/4\" SCH 400"), which is disabled there (no quantity, $0).
 * NOTE: the sheet's section total SUM(M35:M51) is itself buggy — it drops the
 * last three material rows; our total correctly includes them.
 */

const CATEGORY = "Irrigation";
const mat = (slug: string, name: string, unit: string, price: number): SeedMaterial =>
  seedMaterial(CATEGORY, `irr-${slug}`, name, unit, price);

export const IRRIGATION_MATERIALS: SeedMaterial[] = [
  mat("valves", "Valves", "unit(s)", 25),
  mat("teflon-tape", "Teflon tape", "roll(s)", 0.6),
  mat("pvc-nipple-1x18", "PVC nipple 1 x 18", "unit(s)", 0.972),
  mat("pvc-slip-tee-1", '1" PVC slip tee', "unit(s)", 0.761),
  mat("pvc-slip-elbow-1", '1" PVC slip elbow', "unit(s)", 0.572),
  // A second "1\" PVC slip elbow" line appears in the lateral group at a
  // different price (sheet row 49 vs row 39), so it's a distinct material.
  mat("pvc-slip-elbow-1b", '1" PVC slip elbow', "unit(s)", 0.761),
  mat("cl200-34", '3/4" CL 200 (100\')', "unit(s)", 9.994),
  mat("popup-body-6", "6\" pop-up body", "unit(s)", 5.69),
  mat("pvc-nipple-half-15", 'PVC Nipple 1/2" x 15"', "unit(s)", 0.336),
  mat("pvc-slip-tee-34", '3/4" PVC slip tee', "unit(s)", 0.403),
  mat("pvc-slip-elbow-34", '3/4" PVC slip elbow', "unit(s)", 0.319),
  mat("sst-reducing-tee", '3/4 x 3/4 x 1/2 PVC SST reducing tee', "unit(s)", 0.618),
  mat("sch40-1", '1" SCH 40 (100\')', "unit(s)", 26.531),
  mat("pvc-glue-pint", "PVC pipe glue (pint)", "can(s)", 8.036),
  mat("nozzles", "Nozzles", "unit(s)", 2.5),
  mat("shrub-bodies", "Shrub Bodies", "unit(s)", 2.5),
  mat("funny-pipe", "Funny Pipe", "roll(s)", 25),
  mat("funny-elbows", "Funny Elbows", "unit(s)", 0.25),
];

export function buildIrrigationAssembly(
  materialIdBySlug: Record<string, string>,
): AssemblyInput {
  const id = materialIdResolver(materialIdBySlug);
  const zone = "(valves * 16)"; // $E$40

  return {
    name: "Irrigation",
    category: CATEGORY,
    description: "Install valves, lateral lines, heads, and nozzles.",
    sortOrder: 2,
    active: true,
    source: "starter",
    drivers: [
      { key: "valves", label: "Control valves", unit: "unit(s)", defaultValue: 5 },
    ],
    lines: [
      laborLine(1, "installValves", "Install control valves", "0.7475 * valves"),
      laborLine(
        2,
        "lateralLabor",
        "Layout, trench, install lateral pipe, flush, inserts, pressure check, adjust",
        `0.8204 * ${zone}`,
      ),
      materialLine(3, "valveUnits", "Valves", "valves", id("irr-valves")),
      materialLine(4, "teflonTape", "Teflon tape", "valves / 5", id("irr-teflon-tape")),
      materialLine(5, "pvcNipple1x18", "PVC nipple 1 x 18", "round(valves * 2)", id("irr-pvc-nipple-1x18")),
      materialLine(6, "pvcSlipTee1", '1" PVC slip tee', "round(valves * 1.6)", id("irr-pvc-slip-tee-1")),
      materialLine(7, "pvcSlipElbow1", '1" PVC slip elbow', "round(valves * 0.5)", id("irr-pvc-slip-elbow-1")),
      materialLine(8, "cl200", '3/4" CL 200 (100\')', "roundUp(valves * 2, 1)", id("irr-cl200-34")),
      materialLine(9, "popupBody", "6\" pop-up body", `round(${zone} * (2 / 3))`, id("irr-popup-body-6")),
      materialLine(10, "pvcNippleHalf", 'PVC Nipple 1/2" x 15"', `round(${zone} * (1 / 3))`, id("irr-pvc-nipple-half-15")),
      materialLine(11, "pvcSlipTee34", '3/4" PVC slip tee', "round(valves * 10)", id("irr-pvc-slip-tee-34")),
      materialLine(12, "pvcSlipElbow34", '3/4" PVC slip elbow', "round(valves * 10)", id("irr-pvc-slip-elbow-34")),
      materialLine(13, "sstReducingTee", '3/4 x 3/4 x 1/2 PVC SST reducing tee', `round(${zone} * (2 / 3))`, id("irr-sst-reducing-tee")),
      materialLine(14, "sch40", '1" SCH 40 (100\')', "roundUp(valves * 0.2, 1)", id("irr-sch40-1")),
      materialLine(15, "pvcSlipElbow1Lateral", '1" PVC slip elbow', "round(valves * 5)", id("irr-pvc-slip-elbow-1b")),
      materialLine(16, "pvcGlue", "PVC pipe glue (pint)", "valves / 5", id("irr-pvc-glue-pint")),
      materialLine(17, "nozzles", "Nozzles", zone, id("irr-nozzles")),
      materialLine(18, "shrubBodies", "Shrub Bodies", "popupBody", id("irr-shrub-bodies")),
      materialLine(19, "funnyPipe", "Funny Pipe", "1", id("irr-funny-pipe")),
      materialLine(20, "funnyElbows", "Funny Elbows", "popupBody * 2", id("irr-funny-elbows")),
    ],
  };
}
