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
  // The labor task this line belongs to. For a labor line this is its own key;
  // for a material it's the labor line's key it's grouped under; null = ungrouped.
  // A task and its materials therefore share one groupKey.
  groupKey: string | null;
}

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
