import type {
  Estimate,
  EstimateMetaChanges,
  LineItemInput,
  NewEstimate,
} from "./types.ts";

export * from "./types.ts";

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
