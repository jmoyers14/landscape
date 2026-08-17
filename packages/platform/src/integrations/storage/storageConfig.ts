import { z } from "zod";
import { parseConfig } from "../../config/parseConfig.ts";

/**
 * Everything the storage adapters need. Per-slice, so a process that never
 * resolves storage never validates these.
 *
 * The two TTLs differ by intent: a download URL is handed to a user who may take
 * a moment to click, an upload URL is consumed immediately by the browser.
 * `localRoot`/`localBaseUrl` are read only by LocalObjectStorage.
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
  localRoot: z.string().default(".local-storage"),
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
