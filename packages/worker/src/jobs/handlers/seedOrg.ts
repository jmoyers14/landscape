import { injectable } from "tsyringe";
import type { WebhookEvent } from "@landscape/platform";
import type { WebhookHandler } from "../WebhookHandler.ts";

/**
 * STUB. Real org seeding lands in step (d), when SeedService is extracted into
 * platform with the idempotency-by-convergence design it needs.
 *
 * Wired into routing/registry now so the whole pipeline — verify, record,
 * enqueue, run, mark — is exercised end to end for the org path. It ACKS as
 * success so an `organization.created` event flows clean through the system.
 *
 * The catch worth stating plainly: a seedOrg job will read `succeeded` while
 * nothing was actually seeded. That's fine during development but must not reach
 * production as-is — the seed is not idempotent yet (a destructive clear on
 * every run), which is the whole reason it's deferred. Replacing this body is
 * all step (d) changes here; routing and the runner stay put.
 */
@injectable()
export class SeedOrgHandler implements WebhookHandler {
  async handle(event: WebhookEvent): Promise<void> {
    console.warn(
      `[seedOrg] STUB — acking ${event.type} (${event.sourceEventId}) without seeding. ` +
        "Real seeding is step (d).",
    );
  }
}
