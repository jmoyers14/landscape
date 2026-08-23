import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import type { AppConfig } from "../../config/appConfig.ts";
import { LocalObjectStorage } from "./LocalObjectStorage.ts";
import type { StorageConfig } from "./storageConfig.ts";

const ROOT = "/tmp/landscape-storage-test";

const config: StorageConfig = {
  bucket: "landscape-documents-local",
  downloadUrlTtlSeconds: 900,
  uploadUrlTtlSeconds: 300,
  localRoot: ROOT,
  localBaseUrl: "http://localhost:3000",
};

const appConfig = (environment: string): AppConfig =>
  ({ environment }) as unknown as AppConfig;

const storage = (environment = "local") =>
  new LocalObjectStorage(appConfig(environment), config);

afterEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe("LocalObjectStorage", () => {
  it("round-trips bytes through a nested key", async () => {
    const store = storage();
    const bytes = new Uint8Array([37, 80, 68, 70]); // "%PDF"
    await store.put(
      "orgs/org_1/estimates/e1/estimate.pdf",
      bytes,
      "application/pdf",
    );

    expect(await store.get("orgs/org_1/estimates/e1/estimate.pdf")).toEqual(
      bytes,
    );
  });

  it("reports content type and size through head", async () => {
    const store = storage();
    await store.put("orgs/org_1/logo.png", new Uint8Array(11), "image/png");

    expect(await store.head("orgs/org_1/logo.png")).toEqual({
      contentType: "image/png",
      byteSize: 11,
    });
  });

  it("returns null from head for a key that was never written", async () => {
    expect(await storage().head("orgs/org_1/missing.pdf")).toBeNull();
  });

  it("removes an object and its metadata", async () => {
    const store = storage();
    await store.put("orgs/org_1/logo.png", new Uint8Array(4), "image/png");
    await store.remove("orgs/org_1/logo.png");

    expect(await store.head("orgs/org_1/logo.png")).toBeNull();
  });

  it("mints a download url the local route can serve, carrying the filename", async () => {
    const url = await storage().signedDownloadUrl(
      "orgs/org_1/e.pdf",
      "Estimate 12.pdf",
    );

    expect(url).toBe(
      "http://localhost:3000/local-storage/orgs/org_1/e.pdf?filename=Estimate%2012.pdf",
    );
  });

  it("refuses to run outside local, where losing durability would be silent", async () => {
    expect(
      storage("production").put("k", new Uint8Array(1), "application/pdf"),
    ).rejects.toThrow(/never run outside local/);
  });
});
