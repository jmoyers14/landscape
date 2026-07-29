import { z } from "zod";
import { parseConfig } from "@landscape/platform/server";

/**
 * The worker's own HTTP-server slice. Deliberately narrower than the API's
 * ServerConfig: the worker has no browser origin to trust (its callers are
 * Clerk's webhook sender and Cloud Tasks), so there's no CORS/webUrl here.
 */
export interface WorkerConfig {
  port: number;
}

export const WORKER_CONFIG_TOKEN = "WorkerConfig";

const schema = z.object({
  port: z.coerce.number().default(3001),
});

export function loadWorkerConfig(): WorkerConfig {
  return parseConfig("worker", schema, {
    port: process.env.PORT,
  });
}
