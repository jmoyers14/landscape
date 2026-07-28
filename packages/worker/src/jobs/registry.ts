import { injectable } from "tsyringe";
import { JOB_TYPES } from "./jobTypes.ts";
import type { WebhookHandler } from "./WebhookHandler.ts";
import { SyncUserHandler } from "./handlers/syncUser.ts";
import { SeedOrgHandler } from "./handlers/seedOrg.ts";

/**
 * Looks up the handler for a job type. The one place job types bind to
 * implementations, so the runner stays ignorant of which handlers exist.
 *
 * Handlers are constructor-injected (tsyringe resolves each concrete class and
 * its own dependencies), so registering a new job kind is: add the handler, add
 * one line here, add its `JOB_TYPES` entry. `get` returning null for an unknown
 * type is a real case the runner handles — a job enqueued by an older or newer
 * deploy whose handler this process doesn't have.
 */
@injectable()
export class WebhookHandlerRegistry {
  private readonly handlers: Map<string, WebhookHandler>;

  constructor(syncUser: SyncUserHandler, seedOrg: SeedOrgHandler) {
    this.handlers = new Map<string, WebhookHandler>([
      [JOB_TYPES.SYNC_USER, syncUser],
      [JOB_TYPES.SEED_ORG, seedOrg],
    ]);
  }

  get(jobType: string): WebhookHandler | null {
    return this.handlers.get(jobType) ?? null;
  }
}
