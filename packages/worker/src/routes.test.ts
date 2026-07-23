import { describe, expect, it } from "bun:test";
import { handleRequest } from "./routes.ts";

const request = (method: string, path: string): Request =>
  new Request(`http://worker.local${path}`, { method });

describe("handleRequest", () => {
  it("reports healthy on GET /health", async () => {
    const response = await handleRequest(request("GET", "/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for an unknown path", async () => {
    const response = await handleRequest(request("POST", "/nope"));

    expect(response.status).toBe(404);
  });

  it("returns 404 when a known path is called with the wrong method", async () => {
    const response = await handleRequest(request("GET", "/ingest/clerk"));

    expect(response.status).toBe(404);
  });

  it("routes POST /ingest/clerk to the ingestion surface", async () => {
    const response = await handleRequest(request("POST", "/ingest/clerk"));

    expect(response.status).toBe(501);
  });

  // The source is part of the path, so an unrecognised one must not fall
  // through to Clerk's verifier — it has no valid signature to check against.
  it("returns 404 for a webhook source that is not registered", async () => {
    const response = await handleRequest(request("POST", "/ingest/stripe"));

    expect(response.status).toBe(404);
  });

  it("returns 404 for bare /ingest with no source", async () => {
    const response = await handleRequest(request("POST", "/ingest"));

    expect(response.status).toBe(404);
  });

  it("routes any POST under /tasks/ to the job surface", async () => {
    const response = await handleRequest(request("POST", "/tasks/seed-org"));

    expect(response.status).toBe(501);
  });
});
