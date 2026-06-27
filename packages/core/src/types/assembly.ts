export type AssemblyLineKind = "material" | "labor";

// "starter" = seeded from the platform's template catalog; "custom" = authored
// in-app by the org.
export type AssemblySource = "starter" | "custom";

/**
 * A named input to an assembly's formulas (e.g. `drainageFt`). Driver `key`s
 * are the variables every line formula in the assembly may reference.
 */
export interface AssemblyDriver {
  key: string;
  label: string;
  unit: string;
  defaultValue: number;
}

/**
 * Fields common to every assembly line. `quantityFormula` is a text expression
 * (evaluated by the engine's formula module) yielding units for a material line
 * or hours for a labor line. Formulas may reference driver keys and the `key` of
 * any other line in the same assembly.
 */
interface AssemblyLineBase {
  key: string;
  description: string;
  quantityFormula: string;
  sortOrder: number;
}

/** A line that draws a priced item from the material catalog. */
export interface MaterialAssemblyLine extends AssemblyLineBase {
  kind: "material";
  materialId: string; // -> Material catalog document
  deliveriesFormula: string | null; // resolves to a delivery count; null => 0
}

/** A line of labor: hours (from `quantityFormula`) at a named labor rate. */
export interface LaborAssemblyLine extends AssemblyLineBase {
  kind: "labor";
  laborRateKey: string; // -> PricingSettings.laborRates[].key
}

/**
 * One line in an assembly recipe. A discriminated union on `kind`: narrowing on
 * it gives a material line its non-null `materialId` or a labor line its
 * `laborRateKey`, with no cross-kind fields to null-check.
 */
export type AssemblyLine = MaterialAssemblyLine | LaborAssemblyLine;

/**
 * A reusable recipe for one section of work (Drainage, Irrigation, …). Drivers
 * and lines are embedded: they're always loaded and saved with the assembly and
 * never queried on their own.
 */
export interface Assembly {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  source: AssemblySource;
  drivers: AssemblyDriver[];
  lines: AssemblyLine[];
  createdAt: string;
}
