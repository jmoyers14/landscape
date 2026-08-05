import type {
  Estimate,
  EstimateAssembly,
  EstimateStatus,
  LineItem,
  LineItemType,
} from "../types/estimate.ts";

export interface LineItemView extends LineItem {
  lineTotal: number; // pre-tax base: quantity × unitPrice
  cost: number; // direct-cost contribution: base + delivery + tax (materials), base (labor)
}

export interface EstimateTotals {
  materialCost: number; // material base + delivery + tax
  laborCost: number; // labor base, untaxed
  tax: number; // sum of per-line material tax (informational)
  directCost: number; // materialCost + laborCost
  overhead: number;
  profit: number;
  total: number;
}

/** One assembly's own cost buildup, carrying the same shape as the job totals. */
export interface AssemblyTotals extends EstimateTotals {
  assemblyId: string | null; // null = lines with no source assembly
  name: string;
}

export interface EstimateView {
  id: string;
  projectId: string;
  title: string;
  status: EstimateStatus;
  overheadRate: number;
  profitRate: number;
  taxRate: number;
  createdAt: string;
  assemblies: EstimateAssembly[];
  lineItems: LineItemView[];
  assemblyTotals: AssemblyTotals[];
  totals: EstimateTotals;
}

/** The rates a cost buildup needs. PricingSettings is a structural superset. */
export interface CostRates {
  taxRate: number;
  overheadRate: number;
  profitRate: number;
}

/** The minimal shape of a line the buildup prices. */
export interface PricedLine {
  type: LineItemType;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
  deliveryCost: number;
}

/**
 * The cost buildup — the single source of truth for how an estimate's money is
 * computed, faithful to the spreadsheet. Material lines carry their sales tax
 * (per line, pre-markup) and delivery inside direct cost; labor is untaxed.
 * Overhead is margin-basis on MATERIALS ONLY (`materialCost / 0.6 − materialCost`
 * when overheadRate is 40) — the sheet charges no overhead on labor in any of its
 * six phases. Profit is a markup on cost + overhead. Rates are percentages.
 * Nothing here is persisted, so changing the formula is a one-function edit.
 */
export function priceLines(
  lines: PricedLine[],
  rates: CostRates,
): EstimateTotals {
  let materialCost = 0;
  let laborCost = 0;
  let tax = 0;

  for (const line of lines) {
    const base = line.quantity * line.unitPrice;
    if (line.type === "labor") {
      laborCost += base;
      continue;
    }
    const lineTax = line.taxable ? base * (rates.taxRate / 100) : 0;
    tax += lineTax;
    materialCost += base + line.deliveryCost + lineTax;
  }

  const directCost = materialCost + laborCost;
  const overhead = materialCost * (1 / (1 - rates.overheadRate / 100) - 1);
  const profit = (directCost + overhead) * (rates.profitRate / 100);
  const total = directCost + overhead + profit;

  return { materialCost, laborCost, tax, directCost, overhead, profit, total };
}

/**
 * Prices a stored estimate's snapshot into the view the UI consumes. Uses the
 * estimate's own snapshotted rates (not the live catalog), so a sent estimate's
 * money never drifts. `lineTotal` is the pre-tax base; tax/overhead/profit live
 * in `totals`.
 */
export function computeEstimate(estimate: Estimate): EstimateView {
  const lineItems: LineItemView[] = estimate.lineItems.map((item) => ({
    ...item,
    lineTotal: item.quantity * item.unitPrice,
    cost: directCostOfLine(item, estimate.taxRate),
  }));

  return {
    id: estimate.id,
    projectId: estimate.projectId,
    title: estimate.title,
    status: estimate.status,
    overheadRate: estimate.overheadRate,
    profitRate: estimate.profitRate,
    taxRate: estimate.taxRate,
    createdAt: estimate.createdAt,
    assemblies: estimate.assemblies,
    lineItems,
    assemblyTotals: summarizeAssemblies(estimate),
    totals: priceLines(estimate.lineItems, estimate),
  };
}

// A single line's contribution to direct cost: a material carries its delivery
// and per-line tax (pre-markup); labor is untaxed. Mirrors priceLines so the
// per-line `cost`s sum exactly to `totals.directCost` — every level ties out.
function directCostOfLine(item: LineItem, taxRate: number): number {
  const base = item.quantity * item.unitPrice;
  if (item.type === "labor") {
    return base;
  }
  const tax = item.taxable ? base * (taxRate / 100) : 0;
  return base + item.deliveryCost + tax;
}

// Each assembly's own cost buildup. The sheet computes overhead and profit per
// phase (our assembly), not once for the whole bid. Both are linear in their
// bases, so these sum exactly to the estimate's totals — no reconciling line.
// Order is first-seen, which is generation order, which follows `assemblies`.
function summarizeAssemblies(estimate: Estimate): AssemblyTotals[] {
  const nameById = new Map(
    estimate.assemblies.map((a) => [a.assemblyId, a.name]),
  );
  const order: (string | null)[] = [];
  const grouped = new Map<string | null, LineItem[]>();

  for (const item of estimate.lineItems) {
    const key = item.sourceAssemblyId;
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = [];
      grouped.set(key, bucket);
      order.push(key);
    }
    bucket.push(item);
  }

  return order.map((assemblyId) => ({
    assemblyId,
    name:
      assemblyId === null
        ? "Other"
        : (nameById.get(assemblyId) ?? "Unknown assembly"),
    ...priceLines(grouped.get(assemblyId) ?? [], estimate),
  }));
}
