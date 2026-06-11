import type { ItemService } from "./services/ItemService/ItemService.ts";

/**
 * Authenticated principal for a request, derived from a verified Clerk session
 * token. `orgId`/`orgRole` are populated only when the user has an active
 * organization — the tenant boundary for this B2B app.
 */
export interface AuthContext {
  userId: string;
  orgId: string | null;
  orgRole: string | null;
  orgSlug: string | null;
}

/**
 * Request context type. This module imports only service *interfaces* (no DI
 * container, decorators, or runtime globals) so the client can consume the
 * AppRouter type without pulling the server implementation into its compile.
 */
export interface Context {
  auth: AuthContext | null;
  services: {
    itemService: ItemService;
  };
}
