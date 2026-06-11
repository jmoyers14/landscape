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

export interface LineItemInput {
  phase: string | null;
  type: LineItemType;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
}

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

export interface NewEstimate {
  projectId: string;
  title: string;
  status: EstimateStatus;
  overheadRate: number;
  profitRate: number;
  taxRate: number;
}

export interface EstimateMetaChanges {
  title?: string;
  status?: EstimateStatus;
  overheadRate?: number;
  profitRate?: number;
  taxRate?: number;
}

/**
 * Persistence boundary for estimates, org-scoped throughout. Line-item
 * operations live here because they manipulate embedded subdocuments — a
 * persistence concern — and return the whole updated estimate so the service
 * can recompute totals.
 */
export interface EstimateRepository {
  findByProject(orgId: string, projectId: string): Promise<Estimate[]>;
  findById(orgId: string, id: string): Promise<Estimate | null>;
  create(orgId: string, data: NewEstimate): Promise<Estimate>;
  updateMeta(
    orgId: string,
    id: string,
    changes: EstimateMetaChanges,
  ): Promise<Estimate | null>;
  addLineItem(
    orgId: string,
    id: string,
    item: LineItemInput,
  ): Promise<Estimate | null>;
  updateLineItem(
    orgId: string,
    id: string,
    lineItemId: string,
    item: LineItemInput,
  ): Promise<Estimate | null>;
  removeLineItem(
    orgId: string,
    id: string,
    lineItemId: string,
  ): Promise<Estimate | null>;
  deleteById(orgId: string, id: string): Promise<void>;
}
