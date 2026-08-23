import { inject, injectable } from "tsyringe";
import { z } from "zod";
import {
  SEED_SERVICE_TOKEN,
  WEBHOOK_EVENT_REPOSITORY_TOKEN,
  type Job,
  type SeedService,
  type WebhookEventRepository,
} from "@landscape/platform";
import type { JobHandler } from "../JobHandler.ts";
import { PoisonJobError } from "../PoisonJobError.ts";
import { webhookPayloadSchema } from "./webhookPayload.ts";

// Clerk's organization.* payload (event.data). The id IS the app's orgId (the
// Clerk org is the tenant); the name pre-fills the company profile.
const clerkOrgSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
});

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
export class SeedOrgHandler implements JobHandler {
  constructor(
    @inject(WEBHOOK_EVENT_REPOSITORY_TOKEN)
    private readonly events: WebhookEventRepository,
    @inject(SEED_SERVICE_TOKEN)
    private readonly seedService: SeedService,
  ) {}

  async handle(job: Job): Promise<void> {
    const { source, sourceEventId } = webhookPayloadSchema.parse(job.payload);
    const event = await this.events.findBySourceEventId(source, sourceEventId);
    if (!event) {
      // The event is recorded before the job is enqueued, so its absence is
      // permanent, not a race worth retrying.
      throw new PoisonJobError("raw event missing");
    }

    // A bad shape throws, which the runner records as a failed job. Clerk's org
    // id IS the app's orgId (the Clerk org is the tenant).
    const { id: orgId, name } = clerkOrgSchema.parse(event.payload);
    await this.seedService.seedNewOrg(orgId, name);
  }
}
