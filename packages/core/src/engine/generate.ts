import type { Assembly } from "../types/assembly.ts";
import type { Material } from "../types/material.ts";
import type { PricingSettings } from "../types/pricing.ts";
import { FormulaError, evaluate, resolveQuantities } from "./formula.ts";

/**
 * Turns chosen assemblies + driver values into priced line items — the
 * generation half of the engine described in docs/data-model.md. The cost
 * buildup over these lines lives in calc.ts (`priceLines`).
 *
 * Each generated line freezes the formula it was produced from
 * (`quantityFormula`) alongside its resolved numbers, so an estimate can always
 * show its work even after the catalog's live formulas change.
 */

export interface GeneratedLineItem {
  phase: string | null; // assembly name, drives the phase rollup
  type: "material" | "labor";
  description: string;
  quantity: number; // resolved units, or hours for labor
  unit: string | null;
  unitPrice: number; // material unit price, or hourly rate
  taxable: boolean;
  deliveryCost: number; // resolved delivery cost for the whole line
  quantityFormula: string; // frozen, for auditability
  sourceAssemblyId: string | null;
  sourceLineKey: string;
}

export interface SelectedAssembly {
  assembly: Assembly;
  driverValues: Record<string, number>;
}

/**
 * Generate the line items for one selected assembly. Material lines resolve
 * their unit price + unit of measure from the catalog; labor lines resolve
 * their hourly rate from pricing settings. Quantities (and delivery counts) come
 * from the formula engine.
 */
export function generateAssemblyLines(
  selection: SelectedAssembly,
  materialsById: Map<string, Material>,
  settings: PricingSettings,
): GeneratedLineItem[] {
  const { assembly, driverValues } = selection;
  const quantities = resolveQuantities(assembly.lines, driverValues);
  const scope: Record<string, number> = { ...driverValues };
  for (const [key, value] of quantities) {
    scope[key] = value;
  }

  return assembly.lines
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((line): GeneratedLineItem => {
      const quantity = quantities.get(line.key) ?? 0;
      const base = {
        phase: assembly.name,
        description: line.description,
        quantity,
        quantityFormula: line.quantityFormula,
        sourceAssemblyId: assembly.id,
        sourceLineKey: line.key,
      };

      if (line.kind === "labor") {
        const rate = settings.laborRates.find(
          (r) => r.key === line.laborRateKey,
        );
        if (!rate) {
          throw new FormulaError(
            `Labor line "${line.key}" references unknown labor rate "${line.laborRateKey}"`,
          );
        }
        return {
          ...base,
          type: "labor",
          unit: "hr",
          unitPrice: rate.rate,
          taxable: false,
          deliveryCost: 0,
        };
      }

      const material = materialsById.get(line.materialId);
      if (!material) {
        throw new FormulaError(
          `Material line "${line.key}" references unknown material "${line.materialId}"`,
        );
      }
      const deliveries = line.deliveriesFormula
        ? evaluate(line.deliveriesFormula, scope)
        : 0;
      return {
        ...base,
        type: "material",
        unit: material.unit,
        unitPrice: material.unitPrice,
        taxable: material.taxable,
        deliveryCost: material.deliveryCost * deliveries,
      };
    });
}
