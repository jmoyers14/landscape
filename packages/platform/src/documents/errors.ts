/**
 * The estimate a document was requested for doesn't exist, or belongs to another
 * org (the repository's org-scoped read makes those indistinguishable, which is
 * the point — a cross-tenant id must not be identifiable as "exists elsewhere").
 *
 * Permanent by nature: the worker maps this to a poison outcome and acks rather
 * than retrying, and the API maps it to NOT_FOUND.
 */
export class MissingEstimateError extends Error {
  constructor(estimateId: string) {
    super(`estimate ${estimateId} not found`);
    this.name = "MissingEstimateError";
  }
}
