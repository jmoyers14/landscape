import { inject, injectable } from "tsyringe";
import { APP_CONFIG_TOKEN, type AppConfig } from "../../config/appConfig.ts";
import type { TaskQueue, TaskRequest } from "./TaskQueue.ts";

/**
 * Local-development TaskQueue. Cloud Tasks has no emulator, so without this the
 * entire webhook path would be untestable off GCP.
 *
 * Delivers by POSTing straight back to the worker's own `/tasks/{jobType}`
 * endpoint — the same HTTP hop Cloud Tasks would make. That's the point: the
 * ingest handler, the route, runJob, and the handler registry all run exactly as
 * they will in production. Only the transport in between is different.
 *
 * What it deliberately does NOT reproduce:
 *  - **Retries.** A failed job stays failed. Its row records the error, and
 *    re-triggering is a manual re-send from the Clerk dashboard.
 *  - **Dedup by task name.** Only the job row's $setOnInsert protects you
 *    locally. That's the weaker of the two guards, so a local run exercises the
 *    less forgiving path — which is the right way round for catching bugs.
 *  - **Backpressure.** Delivery is fire-and-forget on the same process.
 *
 * Refuses to run outside local for that reason: silently degrading to
 * no-retries in production would turn a transient failure into lost work.
 */
@injectable()
export class InlineTaskQueue implements TaskQueue {
  constructor(
    @inject(APP_CONFIG_TOKEN)
    private readonly appConfig: AppConfig,
  ) {}

  async enqueue(request: TaskRequest): Promise<void> {
    if (this.appConfig.environment !== "local") {
      throw new Error(
        `InlineTaskQueue must never run outside local (environment=${this.appConfig.environment}). ` +
          "It provides no retries, so a transient failure would silently lose the job.",
      );
    }

    const url = `http://localhost:${process.env.PORT ?? 3001}/tasks/${request.jobType}`;

    // Not awaited: the ingest request must return promptly so the provider sees
    // a 2xx, exactly as it would if a real queue had accepted the task. Errors
    // are logged rather than propagated, because a delivery failure here is a
    // local-tooling problem, not something the ingestion path should report.
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request.payload),
    }).catch((error) => {
      console.error(`[InlineTaskQueue] failed to deliver ${request.jobType}:`, error);
    });
  }
}
