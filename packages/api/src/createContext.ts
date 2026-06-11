import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import {
  container,
  AUTH_SERVICE_TOKEN,
  CLIENT_SERVICE_TOKEN,
  PROJECT_SERVICE_TOKEN,
} from "./services/index.ts";
import type { ClientService } from "./services/ClientService/ClientService.ts";
import type { ProjectService } from "./services/ProjectService/ProjectService.ts";
import type { AuthService } from "./services/AuthService/AuthService.ts";
import type { Context } from "./context.ts";

/**
 * Runs per request. Authenticates the caller via AuthService and resolves the
 * services each procedure needs from the DI container. Lives apart from the
 * Context type so only the server entry imports the container.
 */
export async function createContext(
  opts: CreateHTTPContextOptions,
): Promise<Context> {
  const authService = container.resolve<AuthService>(AUTH_SERVICE_TOKEN);
  const auth = await authService.authenticate(opts.req.headers.authorization);

  return {
    auth,
    services: {
      clientService: container.resolve<ClientService>(CLIENT_SERVICE_TOKEN),
      projectService: container.resolve<ProjectService>(PROJECT_SERVICE_TOKEN),
    },
  };
}
