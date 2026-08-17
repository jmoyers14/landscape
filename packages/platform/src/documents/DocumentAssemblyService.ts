import type { EstimateDocument, PartsOrderDocument } from "./types.ts";

export const DOCUMENT_ASSEMBLY_SERVICE_TOKEN = "DocumentAssemblyService";

/**
 * Turns an estimate into the plain view models a renderer consumes.
 *
 * Lives in platform because both entrypoints need it: the worker renders from it
 * and the API's tests assert against it. All the logic is here — org-scoped
 * loads, the cost buildup, grouping, the logo fetch, and every rounding decision
 * — so templates hold none and cannot disagree with the estimate.
 *
 * Throws MissingEstimateError when the estimate doesn't exist for that org.
 */
export interface DocumentAssemblyService {
  buildEstimateDocument(
    orgId: string,
    estimateId: string,
  ): Promise<EstimateDocument>;
  buildPartsOrderDocument(
    orgId: string,
    estimateId: string,
  ): Promise<PartsOrderDocument>;
}
