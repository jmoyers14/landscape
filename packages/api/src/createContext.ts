import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { container, GREETING_SERVICE_TOKEN } from "./services/index.ts";
import type { GreetingService } from "./services/GreetingService/GreetingService.ts";
import type { Context } from "./context.ts";

/**
 * Runs per request. Resolves the services each procedure needs from the DI
 * container and exposes them on ctx so routers stay thin. Lives apart from the
 * Context type so only the server entry imports the container.
 */
export function createContext(_opts: CreateHTTPContextOptions): Context {
  return {
    services: {
      greetingService: container.resolve<GreetingService>(
        GREETING_SERVICE_TOKEN,
      ),
    },
  };
}
