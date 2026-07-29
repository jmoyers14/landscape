// WebhookSource is shared vocabulary across both webhook repositories; it's
// declared with the event record and imported here rather than duplicated.
import type { WebhookSource } from "../WebhookEventRepository/types.ts";

export type { WebhookSource };

/**
 * Lifecycle of a job. `failed` means the last attempt failed — the queue may
 * still retry it, at which point it goes back to `running`. Only `succeeded` is
 * terminal.
 */
export type WebhookJobStatus = "pending" | "running" | "succeeded" | "failed";

/**
 * One unit of work derived from a webhook event, plus its execution record.
 * Plain data, free of Mongoose types.
 */
export interface WebhookJob {
  id: string;
  source: WebhookSource;
  /** The event this job came from — (source, sourceEventId, jobType) is the dedup key. */
  sourceEventId: string;
  /** What to run. Maps to a registered handler. */
  jobType: string;
  status: WebhookJobStatus;
  /** How many times the worker has started this job. */
  attempts: number;
  lastError: string | null;
  /** Recorded when the payload carries one, for operational queries only. */
  orgId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields supplied when a job is first enqueued. Status/attempts/lastError are
 * owned by the execution path, not the caller, so they aren't accepted here.
 */
export type WebhookJobInput = Pick<
  WebhookJob,
  "source" | "sourceEventId" | "jobType" | "orgId"
>;
