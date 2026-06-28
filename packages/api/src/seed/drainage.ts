import type { AssemblyInput } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import {
  type SeedMaterial,
  laborLine,
  materialIdResolver,
  materialLine,
  seedMaterial,
} from "./types.ts";

/**
 * Drainage starter catalog, transcribed full from the Package sheet's Drainage
 * section (rows 9–25), driver `drainageFt` = $E$9 = 225.
 *
 * Where the sheet hard-codes a quantity that elsewhere is `round((d/85)*2)`
 * (cells E14–E16, E18), we use the formula, not the frozen literal, so the
 * estimate scales with the driver — modeling intent over the as-saved cell.
 */

const CATEGORY = "Drainage";
const mat = (slug: string, name: string, unit: string, price: number): SeedMaterial =>
  seedMaterial(CATEGORY, `drainage-${slug}`, name, unit, price);

export const DRAINAGE_MATERIALS: SeedMaterial[] = [
  mat("catch-basin-single", "Single outlet catch basin", "unit(s)", 6.853),
  mat("catch-basin-double", "Double outlet catch basin", "unit(s)", 6.853),
  mat("elbow-3-90", '3" 90 degree elbows', "unit(s)", 2.13),
  mat("tee-3", '3" drain tees', "unit(s)", 2.54),
  mat("bend-3-45", '3" 45 degree', "unit(s)", 2.73),
  mat("coupling-3", '3" coupling', "unit(s)", 1.08),
  mat("grate-6-round", '6" round green grate', "unit(s)", 4.026),
  mat("grate-6-atrium", '6" green atrium grate', "unit(s)", 6.441),
  mat("grate-3-round", '3" round green grate', "unit(s)", 1.359),
  mat("grate-3-atrium", '3" green atrium grate', "unit(s)", 3.185),
  mat("solid-pipe-3", 'Solid drain pipe 3" x 10\'', "pcs.", 4.13),
  mat("solid-pipe-6", 'Solid drain pipe 6" x 10\'', "pcs.", 13.94),
  mat("glue", "Drain pipe glue (pipe 600 adhesive)", "can(s)", 8.81),
  mat("pipe-wrap", '10 mil pipe wrap (2" x 100\')', "roll(s)", 3.44),
  mat("curb-core", "Curb core", "core", 75),
];

export function buildDrainageAssembly(
  materialIdBySlug: Record<string, string>,
): AssemblyInput {
  const id = materialIdResolver(materialIdBySlug);
  const single = "round(drainageFt / 85)"; // E11/E17/E19/E20: round(d/85)
  const double = "round((drainageFt / 85) * 2)"; // E12-E16, E18: round((d/85)*2)

  return {
    name: "Drainage",
    category: CATEGORY,
    description: "Lay out, trench, and install drains and basins.",
    sortOrder: 1,
    active: true,
    source: "starter",
    drivers: [
      { key: "drainageFt", label: "Drainage length", unit: "ft.", defaultValue: 225 },
    ],
    lines: [
      laborLine(1, "layout", "Lay out, trenching, and back filling", "0.095 * drainageFt"),
      laborLine(2, "install", "Installing pipe, basins, grates", "0.05273 * drainageFt"),
      // All materials are consumed by the "install" task (sheet rows 11–25).
      materialLine(3, "catchBasinSingle", "Single outlet catch basin", single, id("drainage-catch-basin-single"), { groupKey: "install" }),
      materialLine(4, "catchBasinDouble", "Double outlet catch basin", double, id("drainage-catch-basin-double"), { groupKey: "install" }),
      materialLine(5, "elbow390", '3" 90 degree elbows', double, id("drainage-elbow-3-90"), { groupKey: "install" }),
      materialLine(6, "tee3", '3" drain tees', double, id("drainage-tee-3"), { groupKey: "install" }),
      materialLine(7, "bend45", '3" 45 degree', double, id("drainage-bend-3-45"), { groupKey: "install" }),
      materialLine(8, "coupling3", '3" coupling', double, id("drainage-coupling-3"), { groupKey: "install" }),
      materialLine(9, "grate6Round", '6" round green grate', single, id("drainage-grate-6-round"), { groupKey: "install" }),
      materialLine(10, "grate6Atrium", '6" green atrium grate', double, id("drainage-grate-6-atrium"), { groupKey: "install" }),
      materialLine(11, "grate3Round", '3" round green grate', single, id("drainage-grate-3-round"), { groupKey: "install" }),
      materialLine(12, "grate3Atrium", '3" green atrium grate', single, id("drainage-grate-3-atrium"), { groupKey: "install" }),
      materialLine(13, "solidPipe3", 'Solid drain pipe 3" x 10\'', "roundUp(drainageFt / 10)", id("drainage-solid-pipe-3"), { groupKey: "install" }),
      materialLine(14, "solidPipe6", 'Solid drain pipe 6" x 10\'', "round(drainageFt / 150, 1)", id("drainage-solid-pipe-6"), { groupKey: "install" }),
      materialLine(15, "glue", "Drain pipe glue (pipe 600 adhesive)", "drainageFt / 300", id("drainage-glue"), { groupKey: "install" }),
      materialLine(16, "pipeWrap", '10 mil pipe wrap (2" x 100\')', "drainageFt / 150", id("drainage-pipe-wrap"), { groupKey: "install" }),
      materialLine(17, "curbCore", "Curb core", "drainageFt < 175 ? 1 : 2", id("drainage-curb-core"), { groupKey: "install" }),
    ],
  };
}
