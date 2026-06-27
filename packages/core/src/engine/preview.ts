import type { Assembly } from "../types/assembly.ts";
import type { Material } from "../types/material.ts";
import type { PricingSettings } from "../types/pricing.ts";
import type { Estimate, EstimateAssembly, LineItem } from "../types/estimate.ts";
import { generateAssemblyLines } from "./generate.ts";
import { computeEstimate, type EstimateView } from "./calc.ts";

/**
 * Live, persist-nothing estimate calculation. This is what lets the editor
 * recompute the moment a driver value changes — the same engine the server runs
 * on save, run against an in-memory catalog snapshot instead of the database.
 *
 * The server remains authoritative: `setAssemblies` re-runs the identical
 * generation server-side and freezes the result. Because both paths go through
 * `generateAssemblyLines` + `computeEstimate`, the live preview and the saved
 * snapshot agree by construction.
 */

/** Everything the engine needs to price an estimate without touching the DB. */
export interface CatalogContext {
  assemblies: Assembly[];
  materials: Material[];
  pricing: PricingSettings;
}

/**
 * One chosen assembly. `driverValues` overrides each driver's default; omitted
 * drivers (and any keys that aren't real drivers) fall back to / are filtered
 * against the assembly's declared drivers.
 */
export interface EstimateSelection {
  assemblyId: string;
  driverValues?: Record<string, number>;
}

/**
 * Each declared driver takes the caller's value if given, else its default.
 * Values for undeclared keys are ignored so only real drivers reach the engine.
 * Shared so the client preview and the server snapshot resolve drivers the same
 * way.
 */
export function resolveDriverValues(
  assembly: Assembly,
  provided?: Record<string, number>,
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const driver of assembly.drivers) {
    values[driver.key] = provided?.[driver.key] ?? driver.defaultValue;
  }
  return values;
}

/**
 * Price the chosen assemblies against an in-memory catalog, returning the same
 * EstimateView shape the server's `estimates.get` produces. Selections whose
 * assembly isn't in the context are skipped (the catalog may still be loading or
 * an assembly may have been removed) rather than throwing — a preview should
 * degrade, not blow up, while the user edits.
 */
export function previewEstimate(
  selections: EstimateSelection[],
  context: CatalogContext,
): EstimateView {
  const assembliesById = new Map(context.assemblies.map((a) => [a.id, a]));
  const materialsById = new Map(context.materials.map((m) => [m.id, m]));

  const assemblies: EstimateAssembly[] = [];
  const lineItems: LineItem[] = [];
  for (const selection of selections) {
    const assembly = assembliesById.get(selection.assemblyId);
    if (!assembly) {
      continue;
    }
    const driverValues = resolveDriverValues(assembly, selection.driverValues);
    const generated = generateAssemblyLines(
      { assembly, driverValues },
      materialsById,
      context.pricing,
    );
    for (const line of generated) {
      // Synthesize a stable-enough id for React keys; this view is never saved.
      lineItems.push({ ...line, id: `${assembly.id}:${line.sourceLineKey}` });
    }
    assemblies.push({
      assemblyId: assembly.id,
      name: assembly.name,
      driverValues,
    });
  }

  // Wrap into a synthetic Estimate so the view is shaped by the same
  // computeEstimate the server uses — totals, phase rollups and all.
  const estimate: Estimate = {
    id: "preview",
    projectId: "",
    title: "",
    status: "draft",
    overheadRate: context.pricing.overheadRate,
    profitRate: context.pricing.profitRate,
    taxRate: context.pricing.taxRate,
    assemblies,
    lineItems,
    createdAt: "",
  };
  return computeEstimate(estimate);
}
