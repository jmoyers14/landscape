import { describe, expect, it } from "bun:test";
import type { SeedService, WebhookEvent } from "@landscape/platform";
import { SeedOrgHandler } from "./seedOrg.ts";

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

describe("SeedOrgHandler", () => {
  it("seeds the org from the payload id via the non-destructive path", async () => {
    const seed = new FakeSeedService();
    await new SeedOrgHandler(seed).handle(event({ id: "org_abc", name: "Acme" }));

    expect(seed.seeded).toEqual(["org_abc"]);
  });

  it("throws on a payload with no org id, so the job is recorded as failed", async () => {
    const seed = new FakeSeedService();

    await expect(new SeedOrgHandler(seed).handle(event({ name: "no id" }))).rejects.toThrow();
    expect(seed.seeded).toEqual([]);
  });
});
