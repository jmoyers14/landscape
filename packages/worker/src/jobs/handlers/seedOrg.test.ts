import { describe, expect, it } from "bun:test";
import type {
  SeedService,
  WebhookEvent,
  WebhookEventRepository,
} from "@landscape/platform";
import { makeJob } from "@landscape/platform/test-support";
import { SeedOrgHandler } from "./seedOrg.ts";
import { PoisonJobError } from "../PoisonJobError.ts";
import { JOB_TYPES } from "../jobTypes.ts";

class FakeSeedService implements SeedService {
  public seeded: string[] = [];
  async seedNewOrg(orgId: string) {
    this.seeded.push(orgId);
  }
  async resetOrgCatalog() {
    throw new Error("resetOrgCatalog must not be called from the webhook path");
  }
}

const event = (data: unknown): WebhookEvent => ({
  id: "evt_1",
  source: "clerk",
  sourceEventId: "msg_1",
  type: "organization.created",
  payload: data,
  receivedAt: "2026-01-01T00:00:00.000Z",
});

/** A WebhookEventRepository that only ever resolves the one event under test. */
const eventsReturning = (found: WebhookEvent | null): WebhookEventRepository => ({
  record: async () => {
    throw new Error("record must not be called from a handler");
  },
  findBySourceEventId: async () => found,
});

/** The job the runner hands the handler: a pointer to the recorded event. */
const job = () =>
  makeJob({
    jobType: JOB_TYPES.SEED_ORG,
    dedupKey: "clerk:msg_1",
    payload: { source: "clerk", sourceEventId: "msg_1" },
  });

describe("SeedOrgHandler", () => {
  it("seeds the org from the payload id via the non-destructive path", async () => {
    const seed = new FakeSeedService();
    const handler = new SeedOrgHandler(
      eventsReturning(event({ id: "org_abc", name: "Acme" })),
      seed,
    );

    await handler.handle(job());

    expect(seed.seeded).toEqual(["org_abc"]);
  });

  it("throws on a payload with no org id, so the job is recorded as failed", async () => {
    const seed = new FakeSeedService();
    const handler = new SeedOrgHandler(
      eventsReturning(event({ name: "no id" })),
      seed,
    );

    await expect(handler.handle(job())).rejects.toThrow();
    expect(seed.seeded).toEqual([]);
  });

  it("throws PoisonJobError when the raw event is missing", async () => {
    const seed = new FakeSeedService();
    const handler = new SeedOrgHandler(eventsReturning(null), seed);

    await expect(handler.handle(job())).rejects.toThrow(PoisonJobError);
    expect(seed.seeded).toEqual([]);
  });
});
