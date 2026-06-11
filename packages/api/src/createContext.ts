import { verifyToken } from "@clerk/backend";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import {
  container,
  CONFIG_SERVICE_TOKEN,
  GREETING_SERVICE_TOKEN,
} from "./services/index.ts";
import type { ConfigService } from "./services/ConfigService/ConfigService.ts";
import type { GreetingService } from "./services/GreetingService/GreetingService.ts";
import type { AuthContext, Context } from "./context.ts";

/**
 * Verify the Clerk session token from the Authorization header. Returns null
 * for missing/invalid/expired tokens — procedures decide whether that's allowed
 * (publicProcedure) or rejected (protectedProcedure).
 */
async function authenticate(
  authHeader: string | undefined,
  secretKey: string,
): Promise<AuthContext | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length);
  try {
    const claims = await verifyToken(token, { secretKey });
    return {
      userId: claims.sub,
      orgId: claims.org_id ?? null,
      orgRole: claims.org_role ?? null,
      orgSlug: claims.org_slug ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Runs per request. Authenticates the caller and resolves the services each
 * procedure needs from the DI container. Lives apart from the Context type so
 * only the server entry imports the container.
 */
export async function createContext(
  opts: CreateHTTPContextOptions,
): Promise<Context> {
  const config = container.resolve<ConfigService>(CONFIG_SERVICE_TOKEN);
  const auth = await authenticate(
    opts.req.headers.authorization,
    config.getClerk().secretKey,
  );

  return {
    auth,
    services: {
      greetingService: container.resolve<GreetingService>(
        GREETING_SERVICE_TOKEN,
      ),
    },
  };
}
