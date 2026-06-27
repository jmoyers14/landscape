import type { SeedAssembly } from "./types.ts";
import { DRAINAGE_MATERIALS, buildDrainageAssembly } from "./drainage.ts";
import { IRRIGATION_MATERIALS, buildIrrigationAssembly } from "./irrigation.ts";
import { SOIL_PREP_MATERIALS, buildSoilPrepAssembly } from "./soilPrep.ts";
import { PLANTING_MATERIALS, buildPlantingAssembly } from "./planting.ts";
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
  { materials: SEATING_WALL_MATERIALS, build: buildSeatingWallAssembly },
  // TODO: Concrete (Package sheet rows 99–125, sortOrder 5) is deferred. It has
  // flat-fee line items — "Finishers" ($350 × 8) and the concrete pump's setup
  // fee — that are neither hourly labor nor taxable materials, so they don't fit
  // the current material|labor AssemblyLine model. Revisit once we decide how to
  // represent flat-cost lines (likely an "equipment"/"other" line kind).
];
