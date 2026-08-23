import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { parseConfig } from "../../config/parseConfig.ts";

/**
 * Where `.local-storage/` lives, as an ABSOLUTE path anchored to this file
 * rather than to the process's cwd.
 *
 * cwd is the wrong anchor here because the two processes that share this
 * directory don't share a cwd: `bun run --cwd packages/api dev` and
 * `--cwd packages/worker dev`. A relative default therefore sent the worker's
 * rendered PDFs to `packages/worker/.local-storage` while the API served
 * `/local-storage/*` out of `packages/api/.local-storage` — so every local
 * download 404'd, and confusingly so, since the job still reported `succeeded`.
 *
 * Walks up to the `packages/` directory and takes its parent, so this keeps
 * working if the file moves within the monorepo. Only local development reads
 * it — LocalObjectStorage refuses to run anywhere else — so the fallback for a
 * relocated build is the old cwd-relative path rather than an error.
 */
function defaultLocalRoot(): string {
  let dir = import.meta.dir;
  while (basename(dir) !== "packages") {
    const parent = dirname(dir);
    if (parent === dir) {
      return ".local-storage";
    }
    dir = parent;
  }
  return join(dirname(dir), ".local-storage");
}

/**
 * Everything the storage adapters need. Per-slice, so a process that never
 * resolves storage never validates these.
 *
 * The two TTLs differ by intent: a download URL is handed to a user who may take
 * a moment to click, an upload URL is consumed immediately by the browser.
 * `localRoot` is read by LocalObjectStorage and by the API's `/local-storage/*`
 * route; both must resolve it to the same directory, which is why its default
 * is absolute — see defaultLocalRoot. `localBaseUrl` is LocalObjectStorage's
 * alone.
 */
export interface StorageConfig {
  bucket: string;
  downloadUrlTtlSeconds: number;
  uploadUrlTtlSeconds: number;
  localRoot: string;
  localBaseUrl: string;
}

export const STORAGE_CONFIG_TOKEN = "StorageConfig";

const schema = z.object({
  bucket: z.string().min(1, "DOCUMENTS_BUCKET is required to store documents"),
  downloadUrlTtlSeconds: z.coerce.number().int().positive().default(900),
  uploadUrlTtlSeconds: z.coerce.number().int().positive().default(300),
  localRoot: z.string().default(defaultLocalRoot()),
  localBaseUrl: z.string().url().default("http://localhost:3000"),
});

export function loadStorageConfig(): StorageConfig {
  return parseConfig("object storage", schema, {
    bucket: process.env.DOCUMENTS_BUCKET,
    downloadUrlTtlSeconds: process.env.DOCUMENTS_DOWNLOAD_URL_TTL_SECONDS,
    uploadUrlTtlSeconds: process.env.DOCUMENTS_UPLOAD_URL_TTL_SECONDS,
    localRoot: process.env.LOCAL_STORAGE_ROOT,
    localBaseUrl: process.env.LOCAL_STORAGE_BASE_URL,
  });
}
