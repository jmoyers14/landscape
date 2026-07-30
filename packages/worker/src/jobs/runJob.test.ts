import { describe, expect, it } from "bun:test";
import type {
  Logger,
  WebhookEvent,
  WebhookEventRepository,
  WebhookJob,
  WebhookJobRepository,
  WebhookJobStatus,
} from "@landscape/platform";
import { JobRunner } from "./runJob.ts";
import type { WebhookHandlerRegistry } from "./registry.ts";
import type { WebhookHandler } from "./WebhookHandler.ts";

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

const makeJob = (overrides: Partial<WebhookJob> = {}): WebhookJob => ({
  id: "job_1",
  source: "clerk",
  sourceEventId: "msg_1",
  jobType: JOB_TYPE,
  status: "pending",
  attempts: 0,
  lastError: null,
  orgId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

/** Records the lifecycle transitions the runner drives, for assertion. */
class FakeJobRepository implements WebhookJobRepository {
  public calls: string[] = [];
  constructor(private job: WebhookJob | null) {}

  async enqueuePending() {
    throw new Error("not used by the runner");
    return makeJob();
  }
  async findByJobKey() {
    return this.job;
  }
  async markRunning(id: string) {
    this.calls.push(`markRunning:${id}`);
    if (this.job) {
      this.job = { ...this.job, status: "running", attempts: this.job.attempts + 1 };
    }
    return this.job;
  }
  async markSucceeded(id: string) {
    this.calls.push(`markSucceeded:${id}`);
    return this.job;
  }
  async markFailed(id: string, error: string) {
    this.calls.push(`markFailed:${id}:${error}`);
    return this.job;
  }
  async findById() {
    return this.job;
  }
  async findByStatus(_status: WebhookJobStatus) {
    return [];
  }
}

const event: WebhookEvent = {
  id: "evt_1",
  source: "clerk",
  sourceEventId: "msg_1",
  type: "user.created",
  payload: { id: "user_abc" },
  receivedAt: "2026-01-01T00:00:00.000Z",
};

const eventRepo = (found: WebhookEvent | null = event): WebhookEventRepository =>
  ({
    record: async () => ({ event, alreadySeen: false }),
    findBySourceEventId: async () => found,
  }) as unknown as WebhookEventRepository;

const registryWith = (handler: WebhookHandler | null): WebhookHandlerRegistry =>
  ({ get: () => handler }) as unknown as WebhookHandlerRegistry;

const okHandler: WebhookHandler = { handle: async () => {} };
const throwingHandler: WebhookHandler = {
  handle: async () => {
    throw new Error("boom");
  },
};

const taskRequest = (body: unknown): Request =>
  new Request("http://worker.local/tasks/syncUser", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validKey = { source: "clerk", sourceEventId: "msg_1" };

describe("JobRunner", () => {
  it("runs the handler and marks the job succeeded (200)", async () => {
    const jobs = new FakeJobRepository(makeJob());
    const runner = new JobRunner(eventRepo(), jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validKey));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual(["markRunning:job_1", "markSucceeded:job_1"]);
  });

  it("marks failed and returns 500 (retry) when the handler throws", async () => {
    const jobs = new FakeJobRepository(makeJob());
    const runner = new JobRunner(eventRepo(), jobs, registryWith(throwingHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validKey));

    expect(result.status).toBe(500);
    expect(jobs.calls).toEqual(["markRunning:job_1", "markFailed:job_1:boom"]);
  });

  it("acks an already-succeeded job without re-running it (200)", async () => {
    const jobs = new FakeJobRepository(makeJob({ status: "succeeded", attempts: 1 }));
    const runner = new JobRunner(eventRepo(), jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validKey));

    expect(result.status).toBe(200);
    expect(await responseBody(result)).toMatchObject({ status: "already-succeeded" });
    expect(jobs.calls).toEqual([]); // never touched
  });

  it("acks a malformed task payload as poison (200), touching no job", async () => {
    const jobs = new FakeJobRepository(makeJob());
    const runner = new JobRunner(eventRepo(), jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest({ nonsense: true }));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([]);
  });

  it("acks poison (200) and records failure when no handler is registered", async () => {
    const jobs = new FakeJobRepository(makeJob());
    const runner = new JobRunner(eventRepo(), jobs, registryWith(null), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validKey));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([`markFailed:job_1:no handler registered for ${JOB_TYPE}`]);
  });

  it("acks (200) when the job row can't be found", async () => {
    const jobs = new FakeJobRepository(null);
    const runner = new JobRunner(eventRepo(), jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validKey));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([]);
  });

  it("marks failed and acks (200) when the raw event is missing", async () => {
    const jobs = new FakeJobRepository(makeJob());
    const runner = new JobRunner(eventRepo(null), jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validKey));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual(["markFailed:job_1:raw event missing"]);
  });
});

const responseBody = async (result: { body: unknown }): Promise<unknown> => result.body;
