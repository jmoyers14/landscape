import type { SeedAssembly } from "./types.ts";
import { DRAINAGE_MATERIALS, buildDrainageAssembly } from "./drainage.ts";
import { IRRIGATION_MATERIALS, buildIrrigationAssembly } from "./irrigation.ts";
import { SOIL_PREP_MATERIALS, buildSoilPrepAssembly } from "./soilPrep.ts";
import { PLANTING_MATERIALS, buildPlantingAssembly } from "./planting.ts";
import { CONCRETE_MATERIALS, buildConcreteAssembly } from "./concrete.ts";
import { SEATING_WALL_MATERIALS, buildSeatingWallAssembly } from "./seatingWall.ts";

/**
 * The starter catalog seeded for a new org — the workbook's Package sheet as
 * data. Order here is the assemblies' display order (each also carries its own
 * sortOrder). seedOrg inserts every assembly's materials, then builds the
 * assemblies against the resulting slug→id map.
 */
export const STARTER_ASSEMBLIES: SeedAssembly[] = [
  { materials: DRAINAGE_MATERIALS, build: buildDrainageAssembly },
  { materials: IRRIGATION_MATERIALS, build: buildIrrigationAssembly },
  { materials: SOIL_PREP_MATERIALS, build: buildSoilPrepAssembly },
  { materials: PLANTING_MATERIALS, build: buildPlantingAssembly },
  { materials: CONCRETE_MATERIALS, build: buildConcreteAssembly },
  { materials: SEATING_WALL_MATERIALS, build: buildSeatingWallAssembly },
  // NOTE: Concrete's "Finishers" line (a flat $350 × 8 sub-contract fee) is
  // omitted pending clarification from the business owner — see the TODO in
  // concrete.ts. The concrete pump's setup fee, once also considered "flat",
  // fits the delivery mechanism and is seeded.
];
