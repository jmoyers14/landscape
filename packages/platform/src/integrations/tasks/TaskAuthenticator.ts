/**
 * Decides whether a request to the worker's `/tasks/*` endpoints genuinely came
 * from our task queue.
 *
 * This is the ONLY thing standing between the job endpoints and the public
 * internet. The worker service must be publicly reachable so Clerk can POST to
 * `/ingest/clerk` (Clerk can't present a Google credential), and Cloud Run IAM
 * gates a whole service, not a path — so IAM can't protect `/tasks/*` while
 * `/ingest/clerk` stays open. The guard has to live in the app.
 *
 * In production that means verifying the OIDC token Cloud Tasks attaches (see
 * GoogleOidcTaskAuthenticator). Locally there's no queue and no token, so the
 * local implementation allows everything.
 */
export interface TaskAuthenticator {
  authenticate(request: Request): Promise<boolean>;
}

/**
 * The bearer token from an `Authorization: Bearer <token>` header, or null if
 * the header is absent or not a bearer credential. Pure and exported so the
 * parsing is unit-testable without a real signed token.
 */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * The identity claims we require of a verified OIDC token. Authorship is proven
 * by the signature check (google-auth-library); this is the authorization layer
 * on top of it: the token must be issued as our invoker service account and have
 * a verified email. Pure and exported so this policy is unit-testable apart from
 * the network-bound signature verification.
 */
export function isTrustedTaskCaller(
  claims: { email?: string; email_verified?: boolean } | undefined,
  invokerServiceAccount: string,
): boolean {
  return (
    claims?.email === invokerServiceAccount && claims?.email_verified === true
  );
}
