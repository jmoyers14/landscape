/**
 * Decides whether a request to `/tasks/*` genuinely came from our task queue.
 *
 * This is the ONLY thing standing between the job endpoints and the public
 * internet. The worker service must be publicly reachable so Clerk can POST to
 * `/ingest/clerk`, so Cloud Run IAM can't gate `/tasks/*` — the guard has to
 * live in the app. In production that means verifying the OIDC token Cloud Tasks
 * attaches (issued as a known invoker service account, audience = the worker
 * URL). Locally there's no queue and no token, so the local implementation
 * allows everything.
 */
export interface TaskAuthenticator {
  authenticate(request: Request): Promise<boolean>;
}

export const TASK_AUTHENTICATOR_TOKEN = "TaskAuthenticator";
