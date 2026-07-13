import type { AssemblyInput } from "@landscape/platform";
import {
  type SeedMaterial,
  laborLine,
  materialIdResolver,
  materialLine,
  seedMaterial,
  task,
} from "./types.ts";

/**
 * Planting, transcribed from the Package sheet (rows 76–90). Unlike the other
 * sections there's no single driver — the sheet hard-codes plant counts — so the
 * counts become the drivers an estimator edits. Each tree size carries BOTH a
 * material line (the plant) and its own labor line (install hours per plant), as
 * in the sheet (N76–N79). Two items ship with a $150 delivery (1-gal trees, row
 * 76; mulch, row 90). Tree stakes are a fixed 12 in the sheet (E82); cinch ties
 * key off them. Lawn area defaults to 0 (sheet E86) while sod is its own count
 * (E88 = 1500) — kept separate to reproduce the sheet faithfully.
 */

const CATEGORY = "Planting";
const mat = (slug: string, name: string, unit: string, price: number): SeedMaterial =>
  seedMaterial(CATEGORY, `plant-${slug}`, name, unit, price);
const matDelivered = (
  slug: string,
  name: string,
  unit: string,
  price: number,
  deliveryCost: number,
): SeedMaterial =>
  seedMaterial(CATEGORY, `plant-${slug}`, name, unit, price, { deliveryCost });

export const PLANTING_MATERIALS: SeedMaterial[] = [
  matDelivered("tree-1gal", "1 - gallon tree", "unit(s)", 3.5, 150),
  mat("tree-5gal", "5 - gallon tree", "unit(s)", 10),
  mat("tree-15gal", "15 - gallon tree", "unit(s)", 40),
  mat("tree-24gal", "24 - gallon tree", "unit(s)", 120),
  mat("best-tabs-21g", "21 gram best tabs", "box", 75),
  mat("planting-tabs-5g", "5 gram planting tabs", "box", 75),
  mat("tree-stakes", "Tree Stakes (10' treated)", "pcs.", 4.544),
  mat("cinch-ties", 'Cinch ties 32"', "pcs.", 0.55),
  mat("ground-cover", "8 flats ground cover/color", "flat(s)", 12.5),
  mat("fertilizer", "Fertilizer (50 lb.)", "bag", 50),
  mat("sod", "Sod", "sq. ft.", 1.1),
  matDelivered("mulch", "Mulch (forest mulch)", "yds.", 20, 150),
];

export function buildPlantingAssembly(
  materialIdBySlug: Record<string, string>,
): AssemblyInput {
  const id = materialIdResolver(materialIdBySlug);

  return {
    name: "Planting",
    category: CATEGORY,
    description: "Install trees, shrubs, ground cover, sod, and mulch.",
    sortOrder: 4,
    active: true,
    source: "starter",
    drivers: [
      { key: "treeOneGal", label: "1-gallon trees", unit: "unit(s)", defaultValue: 80 },
      { key: "treeFiveGal", label: "5-gallon trees", unit: "unit(s)", defaultValue: 50 },
      { key: "treeFifteenGal", label: "15-gallon trees", unit: "unit(s)", defaultValue: 5 },
      { key: "treeTwentyFourGal", label: "24-gallon trees", unit: "unit(s)", defaultValue: 3 },
      { key: "groundCoverFlats", label: "Ground cover flats", unit: "flat(s)", defaultValue: 20 },
      { key: "lawnSqFt", label: "Lawn area", unit: "sq. ft.", defaultValue: 0 },
      { key: "sodSqFt", label: "Sod", unit: "sq. ft.", defaultValue: 1500 },
      { key: "mulchYds", label: "Mulch", unit: "yds.", defaultValue: 6 },
    ],
    // One "trees" task gathers every tree size (each its own labor + material
    // line) and the shared planting consumables — modeling the sheet's
    // "lay out, install trees… and deep water" as a single task with many lines,
    // rather than one labor line per group. Ground cover, lawn, and mulch are
    // their own tasks.
    tasks: [
      task(1, "trees", "Lay out, install trees, shrubs, vines, and deep water"),
      task(2, "groundCover", "Install ground cover and color"),
      task(3, "lawn", "Finish grade, fertilize, install lawn, roll, and water"),
      task(4, "mulch", "Install mulch or bark"),
    ],
    lines: [
      // Tree work: a labor + material line per size, all under the "trees" task.
      laborLine(1, "tree1galLabor", "Install 1-gallon trees", "0.2 * treeOneGal", { taskKey: "trees" }),
      materialLine(2, "tree1gal", "1 - gallon tree", "treeOneGal", id("plant-tree-1gal"), { taskKey: "trees", deliveriesFormula: "1" }),
      laborLine(3, "tree5galLabor", "Install 5-gallon trees", "0.5 * treeFiveGal", { taskKey: "trees" }),
      materialLine(4, "tree5gal", "5 - gallon tree", "treeFiveGal", id("plant-tree-5gal"), { taskKey: "trees" }),
      laborLine(5, "tree15galLabor", "Install 15-gallon trees", "1.5 * treeFifteenGal", { taskKey: "trees" }),
      materialLine(6, "tree15gal", "15 - gallon tree", "treeFifteenGal", id("plant-tree-15gal"), { taskKey: "trees" }),
      laborLine(7, "tree24galLabor", "Install 24-gallon trees", "4.33 * treeTwentyFourGal", { taskKey: "trees" }),
      materialLine(8, "tree24gal", "24 - gallon tree", "treeTwentyFourGal", id("plant-tree-24gal"), { taskKey: "trees" }),
      // Planting consumables span all tree sizes; they belong to the trees task.
      materialLine(
        9,
        "bestTabs",
        "21 gram best tabs",
        "(treeFiveGal * 0.01) + (treeFifteenGal * 0.02) + (treeTwentyFourGal * 0.02)",
        id("plant-best-tabs-21g"),
        { taskKey: "trees" },
      ),
      materialLine(
        10,
        "plantingTabs",
        "5 gram planting tabs",
        "(treeOneGal * 0.005) + (treeFiveGal * 0.005)",
        id("plant-planting-tabs-5g"),
        { taskKey: "trees" },
      ),
      materialLine(11, "treeStakes", "Tree Stakes (10' treated)", "12", id("plant-tree-stakes"), { taskKey: "trees" }),
      materialLine(12, "cinchTies", 'Cinch ties 32"', "treeStakes * 4", id("plant-cinch-ties"), { taskKey: "trees" }),
      laborLine(13, "groundCoverLabor", "Install ground cover and color", "0.55472 * groundCoverFlats", { taskKey: "groundCover" }),
      materialLine(14, "groundCover", "8 flats ground cover/color", "groundCoverFlats", id("plant-ground-cover"), { taskKey: "groundCover" }),
      laborLine(15, "lawnLabor", "Finish grade, fertilize, install lawn, roll, and water", "0.01776 * lawnSqFt", { taskKey: "lawn" }),
      materialLine(16, "fertilizer", "Fertilizer (50 lb.)", "round((lawnSqFt / 500) * 0.5)", id("plant-fertilizer"), { taskKey: "lawn" }),
      materialLine(17, "sod", "Sod", "sodSqFt", id("plant-sod"), { taskKey: "lawn" }),
      laborLine(18, "mulchLabor", "Install mulch or bark", "1.243 * mulchYds", { taskKey: "mulch" }),
      materialLine(19, "mulch", "Mulch (forest mulch)", "mulchYds", id("plant-mulch"), { taskKey: "mulch", deliveriesFormula: "1" }),
    ],
  };
}
