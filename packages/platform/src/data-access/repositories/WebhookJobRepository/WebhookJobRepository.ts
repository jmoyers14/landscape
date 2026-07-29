import type {
  WebhookJob,
  WebhookJobInput,
  WebhookJobStatus,
  WebhookSource,
} from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for webhook jobs. Not org-scoped — see the model for why.
 *
 * The write methods are split by lifecycle transition rather than exposing a
 * general `update`, so the set of legal state changes is visible here and the
 * execution path can't invent a new one.
 */
export interface WebhookJobRepository {
  /**
   * Registers a job as pending, or returns the existing one untouched. Uses
   * $setOnInsert on the (source, sourceEventId, jobType) key, so a provider redelivery
   * can NOT reset an already-succeeded job back to pending — the single most
   * important property of this table.
   */
  enqueuePending(input: WebhookJobInput): Promise<WebhookJob>;
  /** Marks a job as started and increments its attempt count. */
  markRunning(id: string): Promise<WebhookJob | null>;
  markSucceeded(id: string): Promise<WebhookJob | null>;
  markFailed(id: string, error: string): Promise<WebhookJob | null>;
  findById(id: string): Promise<WebhookJob | null>;
  findByJobKey(
    source: WebhookSource,
    sourceEventId: string,
    jobType: string,
  ): Promise<WebhookJob | null>;
  /** Operational read: what's stuck or broken. Backs alerting and manual retry. */
  findByStatus(status: WebhookJobStatus, limit: number): Promise<WebhookJob[]>;
}
