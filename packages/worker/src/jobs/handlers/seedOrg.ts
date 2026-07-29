import { inject, injectable } from "tsyringe";
import { z } from "zod";
import {
  SEED_SERVICE_TOKEN,
  type SeedService,
  type WebhookEvent,
} from "@landscape/platform";
import type { WebhookHandler } from "../WebhookHandler.ts";

// Clerk's organization.* payload (event.data). We need only the org id, which
// is the tenant boundary the whole app scopes to.
const clerkOrgSchema = z.object({ id: z.string().min(1) });

/**
 * Seeds a newly-created org's catalog with the starter data on
 * `organization.created`.
 *
 * Delegates to SeedService.seedNewOrg, which is idempotent by convergence — so
 * a Cloud Tasks redelivery (or the same event arriving twice) re-runs safely,
 * updating the starter rows in place rather than duplicating them, and never
 * disturbing anything the org has authored since. That idempotency is exactly
 * what lets this handler satisfy the queue's at-least-once contract.
 */
@injectable()
export class SeedOrgHandler implements WebhookHandler {
  constructor(
    @inject(SEED_SERVICE_TOKEN)
    private readonly seedService: SeedService,
  ) {}

  async handle(event: WebhookEvent): Promise<void> {
    // A bad shape throws, which the runner records as a failed job. Clerk's org
    // id IS the app's orgId (the Clerk org is the tenant).
    const { id: orgId } = clerkOrgSchema.parse(event.payload);
    await this.seedService.seedNewOrg(orgId);
  }
}
