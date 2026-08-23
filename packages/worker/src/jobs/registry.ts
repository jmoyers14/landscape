import { injectable } from "tsyringe";
import { JOB_TYPES } from "@landscape/platform";
import type { JobHandler } from "./JobHandler.ts";
import { SyncUserHandler } from "./handlers/syncUser.ts";
import { SeedOrgHandler } from "./handlers/seedOrg.ts";
import {
  RenderEstimatePdfHandler,
  RenderPartsOrderPdfHandler,
} from "./handlers/renderDocument.ts";

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
export class JobHandlerRegistry {
  private readonly handlers: Map<string, JobHandler>;

  constructor(
    syncUser: SyncUserHandler,
    seedOrg: SeedOrgHandler,
    renderEstimate: RenderEstimatePdfHandler,
    renderPartsOrder: RenderPartsOrderPdfHandler,
  ) {
    this.handlers = new Map<string, JobHandler>([
      [JOB_TYPES.SYNC_USER, syncUser],
      [JOB_TYPES.SEED_ORG, seedOrg],
      [JOB_TYPES.RENDER_ESTIMATE_PDF, renderEstimate],
      [JOB_TYPES.RENDER_PARTS_ORDER_PDF, renderPartsOrder],
    ]);
  }

  get(jobType: string): JobHandler | null {
    return this.handlers.get(jobType) ?? null;
  }
}
