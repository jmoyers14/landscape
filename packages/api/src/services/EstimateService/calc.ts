import type {
  Estimate,
  EstimateStatus,
  LineItem,
} from "../../data-access/repositories/EstimateRepository.ts";

export interface LineItemView extends LineItem {
  lineTotal: number;
}

export interface PhaseSummary {
  phase: string | null;
  subtotal: number;
}

export interface EstimateTotals {
  directCost: number;
  overhead: number;
  profit: number;
  tax: number;
  total: number;
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
  lineItems: LineItemView[];
  phases: PhaseSummary[];
  totals: EstimateTotals;
}

/**
 * The estimating engine — a pure function, the single source of truth for how
 * an estimate's money is computed. Rates are percentages. Order of operations:
 * overhead is a markup on direct cost; profit is a markup on (cost + overhead);
 * tax is on direct cost. Nothing here is persisted, so changing the formula is
 * a one-function edit.
 */
export function computeEstimate(estimate: Estimate): EstimateView {
  const lineItems: LineItemView[] = estimate.lineItems.map((item) => ({
    ...item,
    lineTotal: item.quantity * item.unitPrice,
  }));

  const directCost = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const overhead = directCost * (estimate.overheadRate / 100);
  const profit = (directCost + overhead) * (estimate.profitRate / 100);
  const tax = directCost * (estimate.taxRate / 100);
  const total = directCost + overhead + profit + tax;

  return {
    id: estimate.id,
    projectId: estimate.projectId,
    title: estimate.title,
    status: estimate.status,
    overheadRate: estimate.overheadRate,
    profitRate: estimate.profitRate,
    taxRate: estimate.taxRate,
    createdAt: estimate.createdAt,
    lineItems,
    phases: summarizePhases(lineItems),
    totals: { directCost, overhead, profit, tax, total },
  };
}

// Phase subtotals in first-seen order (the spec's per-phase cost rollup).
function summarizePhases(items: LineItemView[]): PhaseSummary[] {
  const order: (string | null)[] = [];
  const subtotals = new Map<string | null, number>();
  for (const item of items) {
    if (!subtotals.has(item.phase)) {
      order.push(item.phase);
      subtotals.set(item.phase, 0);
    }
    subtotals.set(item.phase, (subtotals.get(item.phase) ?? 0) + item.lineTotal);
  }
  return order.map((phase) => ({ phase, subtotal: subtotals.get(phase) ?? 0 }));
}
