import type { Job } from "@landscape/platform";

/**
 * A unit of background work. One handler per job type.
 *
 * The contract is deliberately thin — take the job record, do the work, and
 * signal the outcome by returning or throwing:
 *  - **return** ⇒ succeeded. Whatever is returned is persisted as the job's
 *    `result` (a render returns `{ storageKey, byteSize }`; a webhook handler
 *    returns nothing).
 *  - **throw** ⇒ failed, and the queue retries per its policy.
 *  - **throw PoisonJobError** ⇒ failed permanently. Recorded, then acked.
 *
 * Handlers MUST be idempotent: the queue guarantees at-least-once delivery, so
 * running twice must converge on the same result. `job.payload` is `unknown` on
 * purpose — a handler validates the shape it needs before trusting it.
 */
export interface JobHandler {
  handle(job: Job): Promise<unknown>;
}
