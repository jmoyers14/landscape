import { describe, expect, it } from "bun:test";
import { routeEvent } from "./eventRouting.ts";
import { JOB_TYPES, QUEUES } from "../jobs/jobTypes.ts";

describe("routeEvent", () => {
  it("routes organization.created to the seed-org job", () => {
    expect(routeEvent("organization.created")).toEqual({
      jobType: JOB_TYPES.SEED_ORG,
      queue: QUEUES.ORG_SEED,
    });
  });

  it("routes both user.created and user.updated to the sync-user job", () => {
    const expected = { jobType: JOB_TYPES.SYNC_USER, queue: QUEUES.USER_SYNC };
    expect(routeEvent("user.created")).toEqual(expected);
    expect(routeEvent("user.updated")).toEqual(expected);
  });

  it("returns null for an event we don't act on", () => {
    // A normal outcome — most verified events are recorded and ignored.
    expect(routeEvent("session.created")).toBeNull();
    expect(routeEvent("user.deleted")).toBeNull();
  });
});
