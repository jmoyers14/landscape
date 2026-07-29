import { inject, injectable } from "tsyringe";
import {
  WEBHOOK_EVENT_REPOSITORY_TOKEN,
  WEBHOOK_JOB_REPOSITORY_TOKEN,
  type WebhookEventRepository,
  type WebhookJobRepository,
} from "@landscape/platform";
import { WebhookHandlerRegistry } from "./registry.ts";
import { taskKeySchema } from "../ingest/taskKey.ts";

/** An HTTP outcome for the route to return to Cloud Tasks. */
export interface JobResult {
  status: number;
  body: unknown;
}

/**
 * Runs one queued job when Cloud Tasks calls `/tasks/{jobType}` back.
 *
 * The return status IS the retry contract, because Cloud Tasks retries on any
 * non-2xx until the queue's max-attempts:
 *  - **200** — done with, do not retry. Covers success AND every permanent
 *    ("poison") outcome: malformed payload, unknown job type, missing rows,
 *    already-succeeded. Retrying those can never help, so we ack and record the
 *    reason in the job row instead of burning attempts.
 *  - **500** — a handler threw. Treated as transient: mark failed, let the queue
 *    retry per policy. A genuinely permanent handler error simply exhausts the
 *    queue's attempts and stays `failed` for manual inspection — the acceptable
 *    cost of not being able to tell transient from permanent from inside a catch.
 *
 * Idempotency backstop: a job already `succeeded` is acked without re-running,
 * which covers the case where the queue's task-name dedup window has lapsed and
 * a late redelivery gets through.
 */
@injectable()
export class JobRunner {
  constructor(
    @inject(WEBHOOK_EVENT_REPOSITORY_TOKEN)
    private readonly events: WebhookEventRepository,
    @inject(WEBHOOK_JOB_REPOSITORY_TOKEN)
    private readonly jobs: WebhookJobRepository,
    private readonly registry: WebhookHandlerRegistry,
  ) {}

  async run(jobType: string, request: Request): Promise<JobResult> {
    const parsed = taskKeySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      // Nothing addressable — can't even find the job. Poison: ack and drop.
      return { status: 200, body: { error: "malformed task payload" } };
    }
    const { source, sourceEventId } = parsed.data;

    const job = await this.jobs.findByJobKey(source, sourceEventId, jobType);
    if (!job) {
      // The pending row is written before the task is enqueued, so this
      // shouldn't happen. Ack rather than retry forever against a row that isn't
      // coming; the absence is logged for investigation.
      console.error(
        `[runJob] no job row for ${source}/${sourceEventId}/${jobType}; acking`,
      );
      return { status: 200, body: { error: "job not found" } };
    }

    if (job.status === "succeeded") {
      return { status: 200, body: { status: "already-succeeded" } };
    }

    const handler = this.registry.get(jobType);
    if (!handler) {
      await this.jobs.markFailed(job.id, `no handler registered for ${jobType}`);
      return { status: 200, body: { error: `unknown job type ${jobType}` } };
    }

    const event = await this.events.findBySourceEventId(source, sourceEventId);
    if (!event) {
      await this.jobs.markFailed(job.id, "raw event missing");
      return { status: 200, body: { error: "raw event missing" } };
    }

    // Count the run before doing the work, so `attempts` reflects reality even
    // if the handler hangs or the instance dies mid-run.
    await this.jobs.markRunning(job.id);

    try {
      await handler.handle(event);
      await this.jobs.markSucceeded(job.id);
      return { status: 200, body: { status: "succeeded", jobType } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.jobs.markFailed(job.id, message);
      // 500 → Cloud Tasks retries per the queue's policy.
      return { status: 500, body: { error: message } };
    }
  }
}

/** Reads the request body as JSON, yielding null on an empty or invalid body. */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
