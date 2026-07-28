import { describe, expect, it } from "bun:test";
import { createRequestHandler, type RouterDeps } from "./routes.ts";
import type { IngestService } from "./ingest/handler.ts";
import type { JobRunner } from "./jobs/runJob.ts";
import type { TaskAuthenticator } from "./tasks/TaskAuthenticator.ts";

/**
 * Routing is tested in isolation with fake collaborators — these assert the
 * router dispatches to the right dependency and honours the task guard, not what
 * the dependencies do. Ingest/run behaviour is covered by their own tests.
 */
const deps = (overrides: Partial<RouterDeps> = {}): RouterDeps => ({
  ingest: {
    handleClerk: async () => ({ status: 202, body: { status: "queued" } }),
  } as unknown as IngestService,
  runner: {
    run: async () => ({ status: 200, body: { status: "succeeded" } }),
  } as unknown as JobRunner,
  taskAuth: { authenticate: async () => true } as TaskAuthenticator,
  ...overrides,
});

const request = (method: string, path: string): Request =>
  new Request(`http://worker.local${path}`, { method });

describe("createRequestHandler", () => {
  it("reports healthy on GET /health", async () => {
    const response = await createRequestHandler(deps())(request("GET", "/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for an unknown path", async () => {
    const response = await createRequestHandler(deps())(request("POST", "/nope"));

    expect(response.status).toBe(404);
  });

  it("returns 404 when a known path is called with the wrong method", async () => {
    const response = await createRequestHandler(deps())(request("GET", "/ingest/clerk"));

    expect(response.status).toBe(404);
  });

  it("returns 404 for a webhook source that is not registered", async () => {
    const response = await createRequestHandler(deps())(request("POST", "/ingest/stripe"));

    expect(response.status).toBe(404);
  });

  it("delegates POST /ingest/clerk to the ingest service", async () => {
    let called = false;
    const handler = createRequestHandler(
      deps({
        ingest: {
          handleClerk: async () => {
            called = true;
            return { status: 202, body: { ok: true } };
          },
        } as unknown as IngestService,
      }),
    );

    const response = await handler(request("POST", "/ingest/clerk"));

    expect(called).toBe(true);
    expect(response.status).toBe(202);
  });

  it("delegates POST /tasks/:type to the runner, passing the job type", async () => {
    let seenJobType = "";
    const handler = createRequestHandler(
      deps({
        runner: {
          run: async (jobType: string) => {
            seenJobType = jobType;
            return { status: 200, body: { ok: true } };
          },
        } as unknown as JobRunner,
      }),
    );

    const response = await handler(request("POST", "/tasks/syncUser"));

    expect(seenJobType).toBe("syncUser");
    expect(response.status).toBe(200);
  });

  it("rejects /tasks/* with 403 when the task guard denies it", async () => {
    let ran = false;
    const handler = createRequestHandler(
      deps({
        taskAuth: { authenticate: async () => false } as TaskAuthenticator,
        runner: {
          run: async () => {
            ran = true;
            return { status: 200, body: {} };
          },
        } as unknown as JobRunner,
      }),
    );

    const response = await handler(request("POST", "/tasks/syncUser"));

    expect(response.status).toBe(403);
    // The guard must short-circuit — the runner never sees an unauthenticated call.
    expect(ran).toBe(false);
  });

  it("returns 404 for bare /tasks/ with no job type", async () => {
    const response = await createRequestHandler(deps())(request("POST", "/tasks/"));

    expect(response.status).toBe(404);
  });
});
