// AuthIdentity crosses the API boundary (it's the request's authenticated
// principal on the tRPC context), so it lives in the domain model. Re-exported
// here so the port and its Clerk adapter keep importing it locally.
export type { AuthIdentity } from "@landscape/domain";
import type { AuthIdentity } from "@landscape/domain";

/**
 * Port for the auth provider. Named by capability (what the app needs), not by
 * vendor — the Clerk-specific adapter implements it. Returns null for a
 * missing/invalid/expired token; callers decide whether that's allowed.
 */
export interface AuthClient {
  verifySessionToken(token: string): Promise<AuthIdentity | null>;
}
