import { z } from "zod";
import type { WebhookSource } from "@landscape/platform";

/**
 * What a queued task carries: just enough to find its job row again. The task is
 * self-describing by natural key rather than by Mongo id, so nothing about the
 * database leaks into the queue and the same key deterministically names the
 * task (see `taskName`).
 *
 * jobType is NOT in the payload — it's in the callback URL (`/tasks/{jobType}`),
 * which is what selects the handler. Keeping it out of the body means the two
 * can't disagree.
 */
export const taskKeySchema = z.object({
  source: z.enum(["clerk"]),
  sourceEventId: z.string().min(1),
});

export type TaskKey = z.infer<typeof taskKeySchema>;

/**
 * The deterministic Cloud Tasks task name — the queue-level dedup key. Same
 * (source, sourceEventId, jobType) always yields the same name, so a provider
 * redelivery is refused by the queue. Cloud Tasks names allow only
 * `[A-Za-z0-9_-]`, so anything else in the provider's id is replaced.
 */
export function taskName(
  source: WebhookSource,
  sourceEventId: string,
  jobType: string,
): string {
  return `${source}-${sourceEventId}-${jobType}`.replace(/[^A-Za-z0-9_-]/g, "_");
}
