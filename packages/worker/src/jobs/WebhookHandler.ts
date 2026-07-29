import type { WebhookEvent } from "@landscape/platform";

/**
 * A unit of work triggered by a webhook. One handler per job type.
 *
 * The contract is deliberately thin — take the recorded event, do the work, and
 * signal the outcome by returning or throwing:
 *  - **return** ⇒ the job succeeded. The runner marks it succeeded and acks the
 *    queue.
 *  - **throw** ⇒ the job failed. The runner records the error and lets the queue
 *    retry per its policy.
 *
 * Handlers MUST be idempotent. The queue guarantees at-least-once delivery, so
 * the same event can arrive more than once; running twice must converge on the
 * same result, never double-apply. The `payload` is `unknown` on purpose — a
 * handler validates the shape it needs before trusting it.
 */
export interface WebhookHandler {
  handle(event: WebhookEvent): Promise<void>;
}
