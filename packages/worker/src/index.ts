import { container } from "./container.ts";
import { createRequestHandler } from "./routes.ts";
import { IngestService } from "./ingest/handler.ts";
import { JobRunner } from "./jobs/runJob.ts";
import {
  TASK_AUTHENTICATOR_TOKEN,
  type TaskAuthenticator,
} from "./tasks/TaskAuthenticator.ts";
import { WORKER_CONFIG_TOKEN, type WorkerConfig } from "./config/workerConfig.ts";
import {
  connectDatabase,
  DATABASE_CONFIG_TOKEN,
  type DatabaseConfig,
} from "@landscape/platform/server";

/**
 * Worker entrypoint: the second Cloud Run service and the app's background
 * job-execution home. It shares the whole backend (repositories, integration
 * adapters, config) with the API through `@landscape/platform` and adds only
 * transport — running work off a queue, plus the inbound endpoints that enqueue
 * it.
 *
 * Webhook ingestion (Clerk) is the first workload to live here, but the worker
 * is deliberately NOT "the webhook service": future non-webhook jobs (scheduled
 * tasks, other queue consumers) belong here too, as new handler families under
 * `jobs/handlers/` and, if they need an inbound trigger, new routes — no new
 * package. See README.md.
 */
const main = async (): Promise<void> => {
  const { port } = container.resolve<WorkerConfig>(WORKER_CONFIG_TOKEN);
  const { uri } = container.resolve<DatabaseConfig>(DATABASE_CONFIG_TOKEN);

  await connectDatabase(uri);
  console.log("Connected to MongoDB");

  // Resolve the route collaborators once at boot. Resolving the authenticator
  // here is also what makes a misconfigured non-local deploy fail fast: the
  // fail-closed factory throws now, at startup, rather than on the first task.
  const handleRequest = createRequestHandler({
    ingest: container.resolve(IngestService),
    runner: container.resolve(JobRunner),
    taskAuth: container.resolve<TaskAuthenticator>(TASK_AUTHENTICATOR_TOKEN),
  });

  const server = Bun.serve({
    port,
    fetch: handleRequest,
  });

  console.log(`Worker listening on http://localhost:${server.port}`);

  // Cloud Run sends SIGTERM before stopping the instance. Stop accepting new
  // requests but let in-flight jobs finish — a job killed mid-write would be
  // redelivered by Cloud Tasks and re-run, which only the idempotent handlers
  // can absorb safely.
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, draining…`);
    await server.stop(false);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
};

main().catch((error) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});
