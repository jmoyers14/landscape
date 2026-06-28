import type { AssemblyInput } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import {
  type SeedMaterial,
  laborLine,
  materialIdResolver,
  materialLine,
  seedMaterial,
} from "./types.ts";

/**
 * Seating / freestanding wall, transcribed from the Package sheet (rows
 * 135–150). Two drivers: `wallHeight` = $D$133 = 2 and `wallLength` = $E$133 =
 * 25. All labor is skilled ($55). The "set block" labor keys off the wall face
 * area (height × length). The 6×8×16 block (rows 140 and 143) is one material
 * used by two lines; only the row-143 line carries the $150 delivery. Several
 * items share a display name at different prices (rebar, redicrete, column
 * block), so they're distinct materials. Stucco (row 150) keys off the footing
 * rebar quantity and its unit price (2.87), inlined.
 */

const CATEGORY = "Seating Wall";
const mat = (slug: string, name: string, unit: string, price: number): SeedMaterial =>
  seedMaterial(CATEGORY, `seat-${slug}`, name, unit, price);

export const SEATING_WALL_MATERIALS: SeedMaterial[] = [
  mat("rebar-3-footing", '#3 Rebar (3/8" - 20\')', "pcs.", 2.87),
  mat("dobies", '3" x 3" dobies', "pcs.", 0.2),
  mat("redicrete-footing", "Redicrete concrete mix", "bag(s)", 3.3),
  seedMaterial(CATEGORY, "seat-block-6x8x16", "6 x 8 x 16 grey concrete block", "blk(s)", 1, { deliveryCost: 150 }),
  mat("column-16x8x16-a", "16 x 8 x 16 grey column block", "blk(s)", 1),
  mat("block-8x4x16", "8 x 4 x 16 grey concrete block", "blk(s)", 1.5),
  mat("column-16x8x16-b", "16 x 8 x 16 grey column block", "blk(s)", 5),
  mat("column-16x4x16", "16 x 4 x 16 grey column block", "blk(s)", 4),
  mat("rebar-3-wall", '#3 Rebar (3/8" - 20\')', "pcs.", 12.5),
  mat("redicrete-wall", "Redicrete concrete mix", "bag(s)", 3.5),
  mat("spec-mix", "Spec mix", "bag(s)", 6),
  mat("stucco", "Stucco", "bag(s)", 14.35),
];

export function buildSeatingWallAssembly(
  materialIdBySlug: Record<string, string>,
): AssemblyInput {
  const id = materialIdResolver(materialIdBySlug);
  const face = "(wallHeight * wallLength)"; // $E$142 = $D$133 * $E$133

  return {
    name: "Seating Wall",
    category: CATEGORY,
    description: "Build a seating / freestanding block wall.",
    sortOrder: 6,
    active: true,
    source: "starter",
    drivers: [
      { key: "wallHeight", label: "Wall height", unit: "ft.", defaultValue: 2 },
      { key: "wallLength", label: "Wall length", unit: "ft.", defaultValue: 25 },
    ],
    lines: [
      laborLine(1, "excavateForm", "Excavate, form, and rebar", "0.3845 * wallLength", "skilled"),
      materialLine(2, "rebarFooting", '#3 Rebar (3/8" - 20\')', "roundUp((wallLength * 2) / 20)", id("seat-rebar-3-footing"), { groupKey: "excavateForm" }),
      materialLine(3, "dobies", '3" x 3" dobies', "even(wallLength - 1)", id("seat-dobies"), { groupKey: "excavateForm" }),
      laborLine(4, "footing", "Install footing or base and first run", "0.24575 * wallLength", "skilled"),
      materialLine(5, "redicreteFooting", "Redicrete concrete mix", "(wallLength * 0.5 * 1) * 1.5", id("seat-redicrete-footing"), { groupKey: "footing" }),
      materialLine(6, "block6x8Footing", "6 x 8 x 16 grey concrete block", "roundUp(wallLength / 1.33333333333333)", id("seat-block-6x8x16"), { groupKey: "footing" }),
      materialLine(7, "column6x8Footing", "16 x 8 x 16 grey column block", "2", id("seat-column-16x8x16-a"), { groupKey: "footing" }),
      laborLine(8, "setBlock", "Set block, grout, brown coat, paint and color coat", `0.42852 * ${face}`, "skilled"),
      materialLine(9, "block6x8Wall", "6 x 8 x 16 grey concrete block", "roundUp(((wallHeight - (2 / 3)) * wallLength) / 0.8889)", id("seat-block-6x8x16"), { groupKey: "setBlock", deliveriesFormula: "1" }),
      materialLine(10, "block8x4Wall", "8 x 4 x 16 grey concrete block", "roundUp(wallLength / 1.33333333333333)", id("seat-block-8x4x16"), { groupKey: "setBlock" }),
      materialLine(11, "column16x8Wall", "16 x 8 x 16 grey column block", "6", id("seat-column-16x8x16-b"), { groupKey: "setBlock" }),
      materialLine(12, "column16x4Wall", "16 x 4 x 16 grey column block", "2", id("seat-column-16x4x16"), { groupKey: "setBlock" }),
      materialLine(13, "rebarWall", '#3 Rebar (3/8" - 20\')', "roundUp(((wallHeight / 1.5) * wallLength) / 20)", id("seat-rebar-3-wall"), { groupKey: "setBlock" }),
      materialLine(14, "redicreteWall", "Redicrete concrete mix", `roundUp(0.25 * ${face})`, id("seat-redicrete-wall"), { groupKey: "setBlock" }),
      materialLine(15, "specMix", "Spec mix", `roundUp(0.166667 * ${face})`, id("seat-spec-mix"), { groupKey: "setBlock" }),
      materialLine(16, "stucco", "Stucco", "roundUp(((rebarFooting * 2.87) * 2) / 100)", id("seat-stucco"), { groupKey: "setBlock" }),
    ],
  };
}
