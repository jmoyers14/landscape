import type { Assembly } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type { Material } from "../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import type { PricingSettings } from "../data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";
import { FormulaError, evaluate, resolveQuantities } from "./formula.ts";

/**
 * Turns chosen assemblies + driver values into priced line items, then runs the
 * cost buildup — the generative engine described in docs/data-model.md.
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

export interface EstimateTotals {
  materialCost: number;
  laborCost: number;
  tax: number;
  directCost: number; // material + labor + tax + delivery
  overhead: number;
  profit: number;
  total: number;
}

/**
 * The cost buildup, faithful to the spreadsheet. Material lines carry their
 * sales tax and delivery inside direct cost; labor is untaxed. Overhead is
 * margin-basis (`cost / 0.6 − cost` when overheadRate is 40); profit is a markup
 * on cost + overhead.
 */
export function priceLineItems(
  items: GeneratedLineItem[],
  settings: PricingSettings,
): EstimateTotals {
  let materialCost = 0;
  let laborCost = 0;
  let tax = 0;

  for (const item of items) {
    const base = item.quantity * item.unitPrice;
    if (item.type === "labor") {
      laborCost += base;
      continue;
    }
    const lineTax = item.taxable ? base * (settings.taxRate / 100) : 0;
    tax += lineTax;
    materialCost += base + item.deliveryCost + lineTax;
  }

  const directCost = materialCost + laborCost;
  const overhead = directCost * (1 / (1 - settings.overheadRate / 100) - 1);
  const profit = (directCost + overhead) * (settings.profitRate / 100);
  const total = directCost + overhead + profit;

  return { materialCost, laborCost, tax, directCost, overhead, profit, total };
}
