import { container } from "./container.ts";
import { handleRequest } from "./routes.ts";
import { WORKER_CONFIG_TOKEN, type WorkerConfig } from "./config/workerConfig.ts";
import {
  connectDatabase,
  DATABASE_CONFIG_TOKEN,
  type DatabaseConfig,
} from "@landscape/platform/server";

/**
 * Worker entrypoint: the second Cloud Run service. It shares the whole backend
 * (repositories, integration adapters, config) with the API through
 * `@landscape/platform` and adds only transport — receiving webhooks and
 * running queued jobs.
 */
const main = async (): Promise<void> => {
  const { port } = container.resolve<WorkerConfig>(WORKER_CONFIG_TOKEN);
  const { uri } = container.resolve<DatabaseConfig>(DATABASE_CONFIG_TOKEN);

  await connectDatabase(uri);
  console.log("Connected to MongoDB");

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
