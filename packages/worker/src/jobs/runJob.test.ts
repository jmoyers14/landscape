import { describe, expect, it } from "bun:test";
import type {
  Job,
  JobRepository,
  JobStatus,
  Logger,
} from "@landscape/platform";
import { makeJob } from "@landscape/platform/test-support";
import { JobRunner } from "./runJob.ts";
import type { JobHandlerRegistry } from "./registry.ts";
import type { JobHandler } from "./JobHandler.ts";
import { PoisonJobError } from "./PoisonJobError.ts";

// The runner logs; these tests assert behaviour, not log output, so swallow it.
const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
};

const JOB_TYPE = "syncUser";
const DEDUP_KEY = "clerk:msg_1";

/** Records the lifecycle transitions the runner drives, for assertion. */
class FakeJobRepository implements JobRepository {
  public calls: string[] = [];
  public lastResult: unknown = undefined;
  constructor(private job: Job | null) {}

  async enqueuePending(): Promise<Job> {
    throw new Error("not used by the runner");
  }
  async findByKey() {
    return this.job;
  }
  async findForOrg() {
    return this.job;
  }
  async markRunning(id: string) {
    this.calls.push(`markRunning:${id}`);
    if (this.job) {
      this.job = {
        ...this.job,
        status: "running",
        attempts: this.job.attempts + 1,
      };
    }
    return this.job;
  }
  async markSucceeded(id: string, result?: unknown) {
    this.calls.push(`markSucceeded:${id}`);
    this.lastResult = result;
    return this.job;
  }
  async markFailed(id: string, error: string) {
    this.calls.push(`markFailed:${id}:${error}`);
    return this.job;
  }
  async findByStatus(_status: JobStatus) {
    return [];
  }
}

const registryWith = (handler: JobHandler | null): JobHandlerRegistry =>
  ({ get: () => handler }) as unknown as JobHandlerRegistry;

const okHandler: JobHandler = { handle: async () => undefined };
const resultHandler: JobHandler = {
  handle: async () => ({ storageKey: "orgs/org_1/x.pdf", byteSize: 1024 }),
};
const throwingHandler: JobHandler = {
  handle: async () => {
    throw new Error("boom");
  },
};
const poisonHandler: JobHandler = {
  handle: async () => {
    throw new PoisonJobError("estimate not found");
  },
};

const taskRequest = (body: unknown): Request =>
  new Request(`http://worker.local/tasks/${JOB_TYPE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validBody = { dedupKey: DEDUP_KEY };
const pendingJob = (over: Partial<Job> = {}): Job =>
  makeJob({ jobType: JOB_TYPE, dedupKey: DEDUP_KEY, ...over });

describe("JobRunner", () => {
  it("runs the handler and marks the job succeeded (200)", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual(["markRunning:job_1", "markSucceeded:job_1"]);
  });

  it("persists the handler's return value as the job result", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(resultHandler), noopLogger);

    await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(jobs.lastResult).toEqual({
      storageKey: "orgs/org_1/x.pdf",
      byteSize: 1024,
    });
  });

  it("marks failed and returns 500 (retry) when the handler throws", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(
      jobs,
      registryWith(throwingHandler),
      noopLogger,
    );

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(500);
    expect(jobs.calls).toEqual(["markRunning:job_1", "markFailed:job_1:boom"]);
  });

  it("acks (200) without retrying when the handler throws PoisonJobError", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(poisonHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([
      "markRunning:job_1",
      "markFailed:job_1:estimate not found",
    ]);
  });

  it("acks an already-succeeded job without re-running it (200)", async () => {
    const jobs = new FakeJobRepository(
      pendingJob({ status: "succeeded", attempts: 1 }),
    );
    const runner = new JobRunner(jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "already-succeeded" });
    expect(jobs.calls).toEqual([]); // never touched
  });

  it("acks a malformed task payload as poison (200), touching no job", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest({ nonsense: true }));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([]);
  });

  it("acks poison (200) and records failure when no handler is registered", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(null), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([
      `markFailed:job_1:no handler registered for ${JOB_TYPE}`,
    ]);
  });

  it("acks (200) when the job row can't be found", async () => {
    const jobs = new FakeJobRepository(null);
    const runner = new JobRunner(jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([]);
  });
});
