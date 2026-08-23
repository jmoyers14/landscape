import { describe, expect, it } from "bun:test";
import { toJob } from "./JobRepositoryImpl.ts";

const doc = {
  _id: "job_1",
  jobType: "renderEstimatePdf",
  dedupKey: "estimate:e1:1700000000000:1",
  orgId: "org_1",
  payload: { estimateId: "e1" },
  result: null,
  status: "pending",
  attempts: 0,
  lastError: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

describe("toJob", () => {
  it("maps a document to a plain entity with ISO timestamps", () => {
    expect(toJob(doc as never)).toEqual({
      id: "job_1",
      jobType: "renderEstimatePdf",
      dedupKey: "estimate:e1:1700000000000:1",
      orgId: "org_1",
      payload: { estimateId: "e1" },
      result: null,
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("normalises a missing orgId, payload, result and lastError to null", () => {
    const sparse = {
      ...doc,
      orgId: undefined,
      payload: undefined,
      result: undefined,
      lastError: undefined,
    };
    const job = toJob(sparse as never);
    expect(job.orgId).toBeNull();
    expect(job.payload).toBeNull();
    expect(job.result).toBeNull();
    expect(job.lastError).toBeNull();
  });
});
