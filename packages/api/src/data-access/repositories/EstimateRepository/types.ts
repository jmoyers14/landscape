import type { Estimate, EstimateAssembly, LineItem } from "@landscape/domain";

// The Estimate entity (and its assembly/line-item shapes) is a shared domain
// type the engine prices, so it lives in @landscape/domain. The persistence-shaped
// derivations — what's accepted to create, change, or snapshot — stay here.
export type {
  Estimate,
  EstimateAssembly,
  EstimateStatus,
  LineItem,
  LineItemType,
} from "@landscape/domain";

/** A generated line to persist — LineItem without its server-assigned id. */
export type LineItemInput = Omit<LineItem, "id">;

// The caller-supplied fields for a new estimate — Estimate without the
// server-managed ones (id, createdAt) and the generated parts the repository
// initializes empty (assemblies, lineItems).
export type NewEstimate = Omit<
  Estimate,
  "id" | "createdAt" | "assemblies" | "lineItems"
>;

// Editable meta: title/status only. Rates are snapshotted at generation, not
// hand-edited, and reassigning the project an estimate belongs to isn't a meta
// edit.
export type EstimateMetaChanges = Partial<Pick<Estimate, "title" | "status">>;

/**
 * The regenerated snapshot the service persists after generating from the chosen
 * assemblies: the inputs, the resolved line items, and the rates captured from
 * PricingSettings at that moment. Replaces the estimate's snapshot wholesale.
 */
export interface EstimateSnapshot {
  assemblies: EstimateAssembly[];
  lineItems: LineItemInput[];
  overheadRate: number;
  profitRate: number;
  taxRate: number;
}
