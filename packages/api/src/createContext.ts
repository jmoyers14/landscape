import { verifyToken } from "@clerk/backend";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import {
  container,
  CONFIG_SERVICE_TOKEN,
  ITEM_SERVICE_TOKEN,
} from "./services/index.ts";
import type { ConfigService } from "./services/ConfigService/ConfigService.ts";
import type { ItemService } from "./services/ItemService/ItemService.ts";
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
    // Clerk v2 session tokens nest org data under `o` (id/rol/slg); v1 used
    // top-level org_* claims. Read both so either token version works.
    const o = (claims as { o?: { id?: string; rol?: string; slg?: string } }).o;
    return {
      userId: claims.sub,
      orgId: claims.org_id ?? o?.id ?? null,
      orgRole: claims.org_role ?? (o?.rol ? `org:${o.rol}` : null),
      orgSlug: claims.org_slug ?? o?.slg ?? null,
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
      itemService: container.resolve<ItemService>(ITEM_SERVICE_TOKEN),
    },
  };
}
