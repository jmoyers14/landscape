import { afterEach, describe, expect, it } from "bun:test";
import { isAbsolute, join } from "node:path";
import { loadStorageConfig } from "./storageConfig.ts";

const originalRoot = process.env.LOCAL_STORAGE_ROOT;
const originalBucket = process.env.DOCUMENTS_BUCKET;
const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  process.env.LOCAL_STORAGE_ROOT = originalRoot;
  process.env.DOCUMENTS_BUCKET = originalBucket;
  if (originalRoot === undefined) {
    delete process.env.LOCAL_STORAGE_ROOT;
  }
});

describe("loadStorageConfig localRoot", () => {
  it("defaults to the same absolute directory whatever the cwd", () => {
    // The bug this pins: the API and the worker are started with different cwds
    // (`bun run --cwd packages/<pkg> dev`), so a cwd-relative default sent the
    // worker's rendered PDFs somewhere the API would never serve them from.
    delete process.env.LOCAL_STORAGE_ROOT;
    process.env.DOCUMENTS_BUCKET = "landscape-documents-local";

    const fromHere = loadStorageConfig().localRoot;
    process.chdir("/tmp");
    const fromElsewhere = loadStorageConfig().localRoot;

    expect(isAbsolute(fromHere)).toBe(true);
    expect(fromElsewhere).toBe(fromHere);
  });

  it("puts it at the repo root, above packages/", () => {
    delete process.env.LOCAL_STORAGE_ROOT;
    process.env.DOCUMENTS_BUCKET = "landscape-documents-local";

    // This file lives at packages/platform/src/integrations/storage.
    const repoRoot = join(import.meta.dir, "..", "..", "..", "..", "..");

    expect(loadStorageConfig().localRoot).toBe(
      join(repoRoot, ".local-storage"),
    );
  });

  it("still lets LOCAL_STORAGE_ROOT override it", () => {
    process.env.LOCAL_STORAGE_ROOT = "/tmp/somewhere-else";
    process.env.DOCUMENTS_BUCKET = "landscape-documents-local";

    expect(loadStorageConfig().localRoot).toBe("/tmp/somewhere-else");
  });
});
