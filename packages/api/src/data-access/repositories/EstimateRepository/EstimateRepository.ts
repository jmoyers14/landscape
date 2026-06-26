import type {
  Estimate,
  EstimateMetaChanges,
  EstimateSnapshot,
  NewEstimate,
} from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for estimates, org-scoped throughout. An estimate's
 * line items are a generated snapshot, replaced wholesale (`replaceSnapshot`)
 * rather than edited one at a time — generation is the only thing that produces
 * them.
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
  replaceSnapshot(
    orgId: string,
    id: string,
    snapshot: EstimateSnapshot,
  ): Promise<Estimate | null>;
  deleteById(orgId: string, id: string): Promise<void>;
}
