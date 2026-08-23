import { describe, expect, it, mock } from "bun:test";
import { PRICING_FORMULA_VERSION } from "@landscape/domain";
import {
  makeEstimate,
  makeEstimateRepoMock,
  makeJob,
  makeJobRepoMock,
  makeObjectStorageFake,
} from "@landscape/platform/test-support";
import { ServiceError } from "../errors.ts";
import { DocumentJobServiceImpl } from "./DocumentJobServiceImpl.ts";

const UPDATED_AT = "2026-08-01T12:00:00.000Z";
const MILLIS = 1785585600000;
const DEDUP_KEY = `estimate:estimate_1:${MILLIS}:${PRICING_FORMULA_VERSION}`;
const STORAGE_KEY = `orgs/org_1/estimates/estimate_1/${MILLIS}-f${PRICING_FORMULA_VERSION}/estimate.pdf`;

const build = (
  over: {
    estimate?: ReturnType<typeof makeEstimate> | null;
    job?: ReturnType<typeof makeJob>;
    found?: ReturnType<typeof makeJob> | null;
  } = {},
) => {
  const estimate =
    over.estimate === undefined
      ? makeEstimate({ updatedAt: UPDATED_AT })
      : over.estimate;
  const enqueued =
    over.job ?? makeJob({ status: "pending", dedupKey: DEDUP_KEY });
  const jobs = makeJobRepoMock({
    enqueuePending: mock(async () => enqueued),
    findForOrg: mock(async () => over.found ?? null),
  });
  const queue = { enqueue: mock(async () => {}) };
  const storage = makeObjectStorageFake();
  const service = new DocumentJobServiceImpl(
    makeEstimateRepoMock({ findById: mock(async () => estimate) }),
    jobs,
    queue,
    storage,
  );
  return { service, jobs, queue, storage };
};

describe("DocumentJobServiceImpl.requestEstimatePdf", () => {
  it("keys the job on the estimate, its version and the formula version", async () => {
    const { service, jobs } = build();

    await service.requestEstimatePdf("org_1", "estimate_1");

    expect(jobs.enqueuePending).toHaveBeenCalledWith({
      jobType: "renderEstimatePdf",
      dedupKey: DEDUP_KEY,
      orgId: "org_1",
      payload: {
        orgId: "org_1",
        estimateId: "estimate_1",
        updatedAt: UPDATED_AT,
        formulaVersion: PRICING_FORMULA_VERSION,
      },
    });
  });

  it("enqueues a task and reports pending when the job is new", async () => {
    const { service, queue } = build();

    const result = await service.requestEstimatePdf("org_1", "estimate_1");

    expect(result).toEqual({ jobId: "job_1", status: "pending", url: null });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it("short-circuits an already-succeeded job to a URL, without touching the queue", async () => {
    const { service, queue } = build({
      job: makeJob({
        status: "succeeded",
        dedupKey: DEDUP_KEY,
        result: { storageKey: STORAGE_KEY, byteSize: 2048 },
      }),
    });

    const result = await service.requestEstimatePdf("org_1", "estimate_1");

    expect(result.status).toBe("succeeded");
    expect(result.url).toBe(`https://signed.test/${STORAGE_KEY}`);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("re-enqueues a failed job so a retry is possible", async () => {
    const { service, queue } = build({
      job: makeJob({ status: "failed", attempts: 2, dedupKey: DEDUP_KEY }),
    });

    await service.requestEstimatePdf("org_1", "estimate_1");

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it("moves the key when the estimate is edited, so an edit can't serve a stale PDF", async () => {
    const { service, jobs } = build({
      estimate: makeEstimate({ updatedAt: "2026-08-02T12:00:00.000Z" }),
    });

    await service.requestEstimatePdf("org_1", "estimate_1");

    expect(jobs.enqueuePending).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupKey: `estimate:estimate_1:${Date.parse("2026-08-02T12:00:00.000Z")}:${PRICING_FORMULA_VERSION}`,
      }),
    );
  });

  it("carries the formula version in the key, so a bump invalidates every cached PDF", async () => {
    // Totals are never stored, so a deploy that changes the buildup reprices
    // every estimate without touching updatedAt. Only this component moves.
    const { service, jobs } = build();

    await service.requestEstimatePdf("org_1", "estimate_1");

    expect(jobs.enqueuePending).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupKey: expect.stringMatching(
          new RegExp(`:${PRICING_FORMULA_VERSION}$`),
        ),
      }),
    );
  });

  it("rejects an estimate from another org as not found", async () => {
    const { service } = build({ estimate: null });

    await expect(
      service.requestEstimatePdf("org_1", "someone_elses"),
    ).rejects.toThrow(ServiceError);
  });
});

describe("DocumentJobServiceImpl.requestPartsOrderPdf", () => {
  it("shares the dedup key but uses its own job type, so the two never collide", async () => {
    const { service, jobs } = build();

    await service.requestPartsOrderPdf("org_1", "estimate_1");

    expect(jobs.enqueuePending).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "renderPartsOrderPdf",
        dedupKey: DEDUP_KEY,
      }),
    );
  });
});

describe("DocumentJobServiceImpl.status", () => {
  it("returns a URL once the job has succeeded", async () => {
    const { service } = build({
      found: makeJob({
        status: "succeeded",
        result: { storageKey: STORAGE_KEY, byteSize: 10 },
      }),
    });

    expect(await service.status("org_1", "job_1")).toEqual({
      jobId: "job_1",
      status: "succeeded",
      url: `https://signed.test/${STORAGE_KEY}`,
    });
  });

  it("reports a failure without leaking the stored error text", async () => {
    const { service } = build({
      found: makeJob({
        status: "failed",
        lastError: "MongoServerError: connection string ...",
      }),
    });

    const result = await service.status("org_1", "job_1");

    expect(result).toEqual({ jobId: "job_1", status: "failed", url: null });
    expect(JSON.stringify(result)).not.toContain("MongoServerError");
  });

  it("is not found for another org's job", async () => {
    const { service } = build({ found: null });

    await expect(service.status("org_1", "job_1")).rejects.toThrow(
      ServiceError,
    );
  });
});
