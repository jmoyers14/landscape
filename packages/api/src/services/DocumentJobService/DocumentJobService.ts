import type { JobStatus } from "@landscape/platform";

export type { JobStatus };

/**
 * What the client sees of a document job. `url` is present only once the job has
 * succeeded, and is minted fresh on every read — signed URLs are short-lived and
 * never stored.
 *
 * There is deliberately no error field. A failed job's `lastError` can carry
 * internals (connection strings, stack text), so the UI shows a generic message
 * keyed off `status` instead and the text never crosses the wire.
 */
export interface DocumentJobView {
  jobId: string;
  status: JobStatus;
  url: string | null;
}

export interface DocumentJobService {
  requestEstimatePdf(
    orgId: string,
    estimateId: string,
  ): Promise<DocumentJobView>;
  requestPartsOrderPdf(
    orgId: string,
    estimateId: string,
  ): Promise<DocumentJobView>;
  status(orgId: string, jobId: string): Promise<DocumentJobView>;
}
