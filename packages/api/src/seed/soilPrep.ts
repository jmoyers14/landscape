import type { AssemblyInput } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import {
  type SeedMaterial,
  laborLine,
  materialIdResolver,
  materialLine,
  seedMaterial,
} from "./types.ts";

/**
 * Soil Preparation, transcribed from the Package sheet (rows 63–66), driver
 * `soilSqFt` = $E$63 = 3000. One labor line plus compost/fertilizer/gypsum,
 * each dosed per 1000 sq. ft.
 */

const CATEGORY = "Soil Preparation";
const mat = (slug: string, name: string, unit: string, price: number): SeedMaterial =>
  seedMaterial(CATEGORY, `soil-${slug}`, name, unit, price);

export const SOIL_PREP_MATERIALS: SeedMaterial[] = [
  mat("compost", "Compost", "yds.", 20),
  mat("fertilizer", "Fertilizer (50 lb.)", "bag(s)", 50),
  mat("gypsum", "Gypsum (50 lb.)", "bag(s)", 15),
];

export function buildSoilPrepAssembly(
  materialIdBySlug: Record<string, string>,
): AssemblyInput {
  const id = materialIdResolver(materialIdBySlug);

  return {
    name: "Soil Preparation",
    category: CATEGORY,
    description: "Amend, rototill, and rough grade the planting area.",
    sortOrder: 3,
    active: true,
    source: "starter",
    drivers: [
      { key: "soilSqFt", label: "Soil prep area", unit: "sq. ft.", defaultValue: 3000 },
    ],
    lines: [
      laborLine(
        1,
        "prep",
        "Install 2\" compost, fertilizer, gypsum, rototill, and rough grade",
        "0.01172 * soilSqFt",
      ),
      materialLine(2, "compost", "Compost", "(soilSqFt / 1000) * 3", id("soil-compost")),
      materialLine(3, "fertilizer", "Fertilizer (50 lb.)", "round((soilSqFt / 1000) * 1.5)", id("soil-fertilizer")),
      materialLine(4, "gypsum", "Gypsum (50 lb.)", "round((soilSqFt / 1000) * 3)", id("soil-gypsum")),
    ],
  };
}
