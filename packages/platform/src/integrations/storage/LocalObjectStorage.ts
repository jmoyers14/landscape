import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { inject, injectable } from "tsyringe";
import { APP_CONFIG_TOKEN, type AppConfig } from "../../config/appConfig.ts";
import type { ObjectStorage, StoredObject } from "./ObjectStorage.ts";
import { STORAGE_CONFIG_TOKEN, type StorageConfig } from "./storageConfig.ts";

/**
 * Local-development ObjectStorage, writing under `.local-storage/`. GCS has no
 * offline emulator worth running, so without this the whole document pipeline
 * would be untestable off GCP.
 *
 * Same shape as InlineTaskQueue, including refusing to run anywhere but local:
 * silently writing durable artifacts to an instance's ephemeral disk in
 * production would lose every PDF on the next revision.
 *
 * Content type has nowhere to live on a filesystem, so it's kept in a sidecar
 * `<key>.meta.json`. The "signed" URLs aren't signed — they point at the API's
 * `/local-storage/*` route, which exists only when the environment is local.
 */
@injectable()
export class LocalObjectStorage implements ObjectStorage {
  constructor(
    @inject(APP_CONFIG_TOKEN)
    private readonly appConfig: AppConfig,
    @inject(STORAGE_CONFIG_TOKEN)
    private readonly config: StorageConfig,
  ) {}

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    this.assertLocal();
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, bytes);
    await Bun.write(
      `${path}.meta.json`,
      JSON.stringify({ contentType, byteSize: bytes.byteLength }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    this.assertLocal();
    return await Bun.file(this.pathFor(key)).bytes();
  }

  async head(key: string): Promise<StoredObject | null> {
    this.assertLocal();
    const path = this.pathFor(key);
    try {
      await stat(path);
    } catch {
      return null;
    }
    const meta = await Bun.file(`${path}.meta.json`).json();
    return { contentType: meta.contentType, byteSize: meta.byteSize };
  }

  async remove(key: string): Promise<void> {
    this.assertLocal();
    const path = this.pathFor(key);
    await rm(path, { force: true });
    await rm(`${path}.meta.json`, { force: true });
  }

  async signedDownloadUrl(key: string, filename: string): Promise<string> {
    this.assertLocal();
    // encodeURIComponent, not URLSearchParams: the latter form-encodes a space
    // as "+", which is only correct under form semantics. Percent-encoding is
    // what a real signed GCS URL carries, so local and deployed agree.
    return `${this.config.localBaseUrl}/local-storage/${key}?filename=${encodeURIComponent(filename)}`;
  }

  async signedUploadUrl(key: string): Promise<string> {
    this.assertLocal();
    return `${this.config.localBaseUrl}/local-storage/${key}`;
  }

  private pathFor(key: string): string {
    return join(this.config.localRoot, key);
  }

  private assertLocal(): void {
    if (this.appConfig.environment !== "local") {
      throw new Error(
        `LocalObjectStorage must never run outside local (environment=${this.appConfig.environment}). ` +
          "It writes to an instance's ephemeral disk, so every stored document would vanish on the next revision.",
      );
    }
  }
}
