export type LineItemType = "material" | "labor" | "equipment" | "other";
export type EstimateStatus = "draft" | "sent" | "accepted";

export interface LineItem {
  id: string;
  phase: string | null;
  type: LineItemType;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
}

/** A line item to add or replace — LineItem without its server-assigned id. */
export type LineItemInput = Omit<LineItem, "id">;

/**
 * Estimate entity — plain data, free of Mongoose types. Line items are embedded
 * (the estimate is the aggregate root). Rates are percentages; monetary totals
 * are NOT stored here — they're derived in the service.
 */
export interface Estimate {
  id: string;
  projectId: string;
  title: string;
  status: EstimateStatus;
  overheadRate: number;
  profitRate: number;
  taxRate: number;
  lineItems: LineItem[];
  createdAt: string;
}

// The caller-supplied fields for a new estimate — Estimate without the
// server-managed ones (id, createdAt) or those the repository initializes
// (lineItems). Omit to match the house idiom (cf. NewProject).
export type NewEstimate = Omit<Estimate, "id" | "createdAt" | "lineItems">;

// The editable meta fields: everything settable at creation except which
// project the estimate belongs to (reassigning that isn't a meta edit).
export type EstimateMetaChanges = Partial<Omit<NewEstimate, "projectId">>;
