export type LineItemType = "material" | "labor" | "equipment" | "other";
export type EstimateStatus = "draft" | "sent" | "accepted";

/**
 * The estimate's inputs: a chosen assembly and the driver values it was
 * generated with. `name` is denormalized for display so listing an estimate
 * needs no catalog lookup.
 */
export interface EstimateAssembly {
  assemblyId: string;
  name: string;
  driverValues: Record<string, number>;
}

/**
 * A generated, frozen line in an estimate's snapshot — a superset of a catalog
 * line. It carries the resolved numbers (quantity, unitPrice, deliveryCost), the
 * tax flag, and provenance (which assembly/line produced it) plus the formula as
 * used, so an estimate can show its work even after the catalog changes.
 */
export interface LineItem {
  id: string;
  phase: string | null;
  type: LineItemType;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  taxable: boolean;
  deliveryCost: number;
  quantityFormula: string;
  sourceAssemblyId: string | null;
  sourceLineKey: string | null;
}

/** A generated line to persist — LineItem without its server-assigned id. */
export type LineItemInput = Omit<LineItem, "id">;

/**
 * Estimate entity — plain data, free of Mongoose types. Holds both the inputs
 * (`assemblies`) and the generated snapshot (`lineItems`). Rates are percentages
 * snapshotted from PricingSettings at generation time; monetary totals are NOT
 * stored here — they're derived by the engine.
 */
export interface Estimate {
  id: string;
  projectId: string;
  title: string;
  status: EstimateStatus;
  overheadRate: number;
  profitRate: number;
  taxRate: number;
  assemblies: EstimateAssembly[];
  lineItems: LineItem[];
  createdAt: string;
}

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
