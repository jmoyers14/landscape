import { inject, injectable } from "tsyringe";
import {
  CLERK_WEBHOOK_VERIFIER_TOKEN,
  JOB_REPOSITORY_TOKEN,
  TASK_QUEUE_TOKEN,
  WEBHOOK_EVENT_REPOSITORY_TOKEN,
  type JobRepository,
  type TaskQueue,
  type WebhookEventRepository,
  type WebhookSource,
  type WebhookVerifier,
} from "@landscape/platform";
import { routeEvent } from "./eventRouting.ts";
import { taskName } from "@landscape/platform";

/** The only source this endpoint serves. */
const SOURCE: WebhookSource = "clerk";

/** An HTTP outcome for the route to return. */
export interface IngestResult {
  status: number;
  body: unknown;
}

/**
 * Owns the `/ingest/clerk` flow. Every write for an inbound webhook happens
 * here; the handlers downstream only read.
 *
 * The sequence is verify → record → (route) → enqueue-pending → enqueue-task,
 * and every step is idempotent so a provider redelivery is fully absorbed:
 *  - a bad signature never persists anything (400);
 *  - the raw event is recorded before any work is scheduled, so there's an audit
 *    row even if scheduling later fails;
 *  - the pending job row is written BEFORE the task is enqueued (a deliberate
 *    deviation from the diagram's order) so the safe failure mode is "job row
 *    exists but no task" — visible and retryable — rather than a task with no
 *    row to record into.
 *
 * Redelivery after a crash mid-flow is self-healing: record/enqueuePending/
 * enqueue are all idempotent, so re-running them ensures the row and task exist
 * without ever duplicating or resetting completed work. That's why nothing here
 * short-circuits on `alreadySeen`.
 */
@injectable()
export class IngestService {
  constructor(
    @inject(CLERK_WEBHOOK_VERIFIER_TOKEN)
    private readonly verifier: WebhookVerifier,
    @inject(WEBHOOK_EVENT_REPOSITORY_TOKEN)
    private readonly events: WebhookEventRepository,
    @inject(JOB_REPOSITORY_TOKEN)
    private readonly jobs: JobRepository,
    @inject(TASK_QUEUE_TOKEN)
    private readonly queue: TaskQueue,
  ) {}

  async handleClerk(request: Request): Promise<IngestResult> {
    const verified = await this.verifier.verify(request);
    if (!verified) {
      // Routine on a public endpoint (scanners, replays, rotated secret). 400
      // and persist nothing.
      return { status: 400, body: { error: "invalid signature" } };
    }

    const { sourceEventId, type, payload } = verified;

    // Audit first: the raw event is stored before anything acts on it, so a
    // later failure can be replayed without asking Clerk to redeliver.
    await this.events.record({ source: SOURCE, sourceEventId, type, payload });

    const route = routeEvent(type);
    if (!route) {
      // Recorded, but we take no action on this type. 200 so Clerk marks it
      // delivered and stops retrying.
      return { status: 200, body: { status: "ignored", type } };
    }

    // The content key for a webhook-derived job. One event can fan out to
    // several job types, and (jobType, dedupKey) is unique, so they don't
    // collide.
    const dedupKey = `${SOURCE}:${sourceEventId}`;

    await this.jobs.enqueuePending({
      jobType: route.jobType,
      dedupKey,
      orgId: orgIdFrom(type, payload),
      // The handler resolves the raw event from this pointer.
      payload: { source: SOURCE, sourceEventId },
    });

    await this.queue.enqueue({
      queue: route.queue,
      jobType: route.jobType,
      name: taskName(route.jobType, dedupKey, 0),
      payload: { dedupKey },
    });

    return { status: 202, body: { status: "queued", jobType: route.jobType } };
  }
}

/**
 * Best-effort tenant tag for operational queries. Only organization events carry
 * the org id as the payload's own id; user events don't reliably carry one, so
 * they're recorded with null rather than guessing.
 */
function orgIdFrom(type: string, payload: unknown): string | null {
  if (!type.startsWith("organization.")) {
    return null;
  }
  const id = (payload as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : null;
}
