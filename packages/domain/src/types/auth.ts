/**
 * Vendor-neutral identity returned by an auth provider after verifying a
 * session token. Free of any SDK types — this is the shape the rest of the app
 * speaks, regardless of which provider (Clerk today) sits behind the port. Part
 * of the domain model because it crosses the API boundary (it's the request's
 * authenticated principal on the tRPC context).
 */
export interface AuthIdentity {
  userId: string;
  orgId: string | null;
  orgRole: string | null;
  orgSlug: string | null;
}
