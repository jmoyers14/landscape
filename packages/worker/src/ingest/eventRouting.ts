import { JOB_TYPES, QUEUES } from "@landscape/platform";

/**
 * Where a verified event goes: which job to run, on which queue.
 */
export interface EventRoute {
  jobType: string;
  queue: string;
}

/**
 * The routing table — the single place that decides what an inbound Clerk event
 * turns into. A table rather than code because the mapping is data: adding an
 * event is a new row, and the set of handled events is readable at a glance.
 *
 * v1 maps each event to at most one job. The job dedup key carries jobType, so
 * fanning one event out to several jobs later is additive (a value becomes a
 * list) and doesn't disturb what's here.
 *
 * Note `organization.created` routes to seedOrg whose handler is still a stub —
 * see handlers/seedOrg.ts. Routing is deliberately wired ahead of the real
 * implementation so the pipeline is exercised end to end now.
 */
const ROUTES: Record<string, EventRoute> = {
  "organization.created": { jobType: JOB_TYPES.SEED_ORG, queue: QUEUES.ORG_SEED },
  "user.created": { jobType: JOB_TYPES.SYNC_USER, queue: QUEUES.USER_SYNC },
  "user.updated": { jobType: JOB_TYPES.SYNC_USER, queue: QUEUES.USER_SYNC },
};

/**
 * Resolve an event type to its route, or null if we don't act on it. Null is a
 * normal outcome, not an error: Clerk sends dozens of event types and we
 * subscribe broadly, so most verified events are recorded for audit and
 * otherwise ignored. `user.deleted` is intentionally absent for now — syncUser
 * is a pure upsert, and wiring deletion is deferred rather than half-done.
 */
export function routeEvent(type: string): EventRoute | null {
  return ROUTES[type] ?? null;
}
