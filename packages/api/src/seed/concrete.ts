import type { AssemblyInput } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import {
  type SeedMaterial,
  laborLine,
  materialIdResolver,
  materialLine,
  seedMaterial,
  task,
} from "./types.ts";

/**
 * Concrete, transcribed from the Package sheet (rows 99–125). Two drivers:
 * `slabArea` = $E$109 = 1000 (nearly everything cascades from it) and
 * `stepsLength` = $E$102 = 25 (independent input for steps / raised patio).
 * Forms labor keys off derived lengths — total form length `E99 = round((area /
 * 100) * 30)`, split 65% straight / 35% curved — so those chain as expression
 * strings (`formTotal`/`straight`/`curved`), the way seatingWall inlines `face`.
 * Concrete volume (`yards`) drives the pour materials.
 *
 * Two sheet quirks fit existing mechanisms rather than a new line kind:
 *   - The concrete pump is untaxed with a flat $250 setup fee — modeled as a
 *     `taxable: false` material carrying a $250 `deliveryCost` at 1 delivery.
 *   - Concrete carries a $30/yd short-load surcharge (sheet col J = 30 × yards)
 *     — modeled as a $30 `deliveryCost` with the yard count as its delivery
 *     formula, so delivery = 30 × yards.
 * The sealer row does double duty (a taxable material AND its application
 * labor), so it becomes two lines sharing the `yards` formula.
 *
 * TODO(finishers): the sheet's "Finishers" line (row 120, a flat $350 × 8
 * sub-contract fee — neither hourly labor nor a taxable material) is
 * deliberately omitted pending confirmation from the business owner of what it
 * represents and how it should be priced. It only feeds the sheet's labor-$
 * total (P127), not the material total (M127) or labor hours (N130), so leaving
 * it out does not perturb the fidelity anchors in catalog.test.ts.
 */

const CATEGORY = "Concrete";
const mat = (slug: string, name: string, unit: string, price: number): SeedMaterial =>
  seedMaterial(CATEGORY, `conc-${slug}`, name, unit, price);

export const CONCRETE_MATERIALS: SeedMaterial[] = [
  mat("lumber-2x6x12", '2" x 6" x 12\' lumber', "pcs.", 15),
  mat("lumber-2x4x12", '2" x 4" x 12\' lumber', "pcs.", 10),
  mat("bender-board", '1/2" x 4" x 14\' bender board', "pcs.", 7.5),
  mat("nails-12d-duplex", "12d duplex nails (5 lb.)", "box", 9.35),
  mat("nails-3d", "3d 1 1/4 nails (1 lb.)", "box", 2.13),
  mat("wood-stakes", "Wood stakes (bundle - 50 stakes)", "bundle", 13.97),
  mat("drain-pipe", "3\" x 10' Drain Pipe", "pcs.", 4.13),
  seedMaterial(CATEGORY, "conc-fill-sand", "Fill Sand #30", "yds.", 25, { deliveryCost: 150 }),
  mat("rebar-3", '#3 Rebar (3/8" - 20\')', "pcs.", 12.5),
  mat("rebar-ties", "Rebar ties", "roll", 2.99),
  mat("plastic-sheeting", "Plastic sheeting (100')", "roll", 33.59),
  mat("expansion-joint", "Expansion joint 1/2\" x 4\" x 10'", "pcs.", 2.67),
  mat("concrete-nails", "Concrete nails (1lb.)", "box", 3.05),
  mat("duct-tape", "Duct Tape", "roll", 4.97),
  // Untaxed rental + flat $250 setup fee (carried as its delivery cost).
  seedMaterial(CATEGORY, "conc-pump", "Concrete pump", "yds.", 7, { taxable: false, deliveryCost: 250 }),
  // $30/yd short-load surcharge, carried as a per-delivery cost (1 delivery/yd).
  seedMaterial(CATEGORY, "conc-concrete", "Concrete", "yds.", 150, { deliveryCost: 30 }),
  mat("sealer", "Concrete Sealer", "yds.", 25),
  mat("color-davis", "Color Davis (lbs.)", "lbs.", 3.5),
  mat("microfiber", "Microfiber", "yds.", 4.5),
];

export function buildConcreteAssembly(
  materialIdBySlug: Record<string, string>,
): AssemblyInput {
  const id = materialIdResolver(materialIdBySlug);
  const formTotal = "round((slabArea / 100) * 30)"; // $E$99
  const straight = `round(${formTotal} * 0.65)`; // $E$100
  const curved = `round(${formTotal} * 0.35)`; // $E$101
  const yards = "(((slabArea * (4 / 12)) / 27) + 0.5)"; // $E$121/122/123/125

  return {
    name: "Concrete",
    category: CATEGORY,
    description: "Form, sub-base, pour, and finish a concrete flatwork slab.",
    sortOrder: 5,
    active: true,
    source: "starter",
    drivers: [
      { key: "slabArea", label: "Slab area", unit: "sq. ft.", defaultValue: 1000 },
      { key: "stepsLength", label: "Steps / raised patio length", unit: "l. ft.", defaultValue: 25 },
    ],
    tasks: [
      task(1, "forms", "Lay out and install forms"),
      task(2, "excavate", "Excavate for sub base and install chase lines"),
      task(3, "subBase", "Install and compact sub base fill, and rebar"),
      task(4, "pour", "Set up pour, strip forms, and clean up"),
    ],
    lines: [
      laborLine(1, "straightForms", "Install straight forms", `0.1109 * ${straight}`, { laborRateKey: "skilled", taskKey: "forms" }),
      laborLine(2, "curvedForms", "Install curved forms", `0.13002 * ${curved}`, { laborRateKey: "skilled", taskKey: "forms" }),
      laborLine(3, "stepsForms", "Install steps/raised patio", "0.20325 * stepsLength", { laborRateKey: "skilled", taskKey: "forms" }),
      materialLine(4, "lumber2x6", '2" x 6" x 12\' lumber', "round(stepsLength / 12)", id("conc-lumber-2x6x12"), { taskKey: "forms" }),
      materialLine(5, "lumber2x4", '2" x 4" x 12\' lumber', `round(${straight} / 12)`, id("conc-lumber-2x4x12"), { taskKey: "forms" }),
      materialLine(6, "benderBoard", '1/2" x 4" x 14\' bender board', `round(${curved} / 14)`, id("conc-bender-board"), { taskKey: "forms" }),
      materialLine(7, "nails12d", "12d duplex nails (5 lb.)", `((${straight} / 10) * 6) / 250`, id("conc-nails-12d-duplex"), { taskKey: "forms" }),
      materialLine(8, "nails3d", "3d 1 1/4 nails (1 lb.)", `((${curved} / 10) * 10) / 250`, id("conc-nails-3d"), { taskKey: "forms" }),
      materialLine(9, "woodStakes", "Wood stakes (bundle - 50 stakes)", `(((${straight} / 10) * 3) + (${curved} / 2)) / 50`, id("conc-wood-stakes"), { taskKey: "forms" }),
      laborLine(10, "excavate", "Excavate for sub base and install chase lines", "0.02486 * slabArea", { taskKey: "excavate" }),
      materialLine(11, "drainPipe", "3\" x 10' Drain Pipe", "round((slabArea / 500) * 10) / 10", id("conc-drain-pipe"), { taskKey: "excavate" }),
      laborLine(12, "subBase", "Install and compact sub base fill, and rebar", "0.0236 * slabArea", { taskKey: "subBase" }),
      materialLine(13, "fillSand", "Fill Sand #30", "((slabArea * (2 / 12)) / 27) * 1.05", id("conc-fill-sand"), { taskKey: "subBase", deliveriesFormula: "1" }),
      materialLine(14, "rebar", '#3 Rebar (3/8" - 20\')', "roundUp(slabArea / 20)", id("conc-rebar-3"), { taskKey: "subBase" }),
      materialLine(15, "rebarTies", "Rebar ties", "slabArea / 2000", id("conc-rebar-ties"), { taskKey: "subBase" }),
      laborLine(16, "pour", "Set up pour, strip forms, and clean up", "0.01146 * slabArea", { laborRateKey: "skilled", taskKey: "pour" }),
      materialLine(17, "plasticSheeting", "Plastic sheeting (100')", "slabArea / 2000", id("conc-plastic-sheeting"), { taskKey: "pour" }),
      materialLine(18, "expansionJoint", "Expansion joint 1/2\" x 4\" x 10'", `roundUp(${formTotal} / 30)`, id("conc-expansion-joint"), { taskKey: "pour" }),
      materialLine(19, "concreteNails", "Concrete nails (1lb.)", "slabArea / 2000", id("conc-concrete-nails"), { taskKey: "pour" }),
      materialLine(20, "ductTape", "Duct Tape", "slabArea / 2000", id("conc-duct-tape"), { taskKey: "pour" }),
      // TODO(finishers): flat $350 × 8 sub-contract fee (row 120) omitted — see file header.
      materialLine(21, "concretePump", "Concrete pump", yards, id("conc-pump"), { taskKey: "pour", deliveriesFormula: "1" }),
      materialLine(22, "concrete", "Concrete", yards, id("conc-concrete"), { taskKey: "pour", deliveriesFormula: yards }),
      materialLine(23, "sealer", "Concrete Sealer", yards, id("conc-sealer"), { taskKey: "pour" }),
      laborLine(24, "sealerApply", "Apply concrete sealer", yards, { laborRateKey: "skilled", taskKey: "pour" }),
      materialLine(25, "colorDavis", "Color Davis (lbs.)", `${yards} * 12`, id("conc-color-davis"), { taskKey: "pour" }),
      materialLine(26, "microfiber", "Microfiber", yards, id("conc-microfiber"), { taskKey: "pour" }),
    ],
  };
}
