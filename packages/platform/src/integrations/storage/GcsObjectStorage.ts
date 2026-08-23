import { Storage } from "@google-cloud/storage";
import { inject, injectable } from "tsyringe";
import type { ObjectStorage, StoredObject } from "./ObjectStorage.ts";
import { STORAGE_CONFIG_TOKEN, type StorageConfig } from "./storageConfig.ts";

/**
 * Google Cloud Storage adapter for the ObjectStorage port.
 *
 * Signing is the subtle part. A Cloud Run service account has no private key, so
 * `getSignedUrl` cannot sign locally — it delegates to the IAM SignBlob API,
 * which requires `iamcredentials.googleapis.com` enabled and
 * `roles/iam.serviceAccountTokenCreator` granted to the service account ON
 * ITSELF (see deploy.sh). Without that grant every signed URL fails at runtime
 * with a permission error, not at boot.
 *
 * If that ever proves painful, the escape hatch is an authenticated API route
 * that pipes the object — no signing at all. This port is what makes that a
 * one-file change.
 */
@injectable()
export class GcsObjectStorage implements ObjectStorage {
  private readonly storage = new Storage();

  constructor(
    @inject(STORAGE_CONFIG_TOKEN)
    private readonly config: StorageConfig,
  ) {}

  private file(key: string) {
    return this.storage.bucket(this.config.bucket).file(key);
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    await this.file(key).save(Buffer.from(bytes), {
      contentType,
      // Uniform bucket-level access: per-object ACLs are rejected outright.
      resumable: false,
    });
  }

  async get(key: string): Promise<Uint8Array> {
    const [buffer] = await this.file(key).download();
    return new Uint8Array(buffer);
  }

  async head(key: string): Promise<StoredObject | null> {
    const [exists] = await this.file(key).exists();
    if (!exists) {
      return null;
    }
    const [metadata] = await this.file(key).getMetadata();
    return {
      contentType: metadata.contentType ?? "application/octet-stream",
      byteSize: Number(metadata.size ?? 0),
    };
  }

  async remove(key: string): Promise<void> {
    // ignoreNotFound: deleting an object that isn't there is the desired end
    // state, not an error — confirmLogo cleans up speculatively.
    await this.file(key).delete({ ignoreNotFound: true });
  }

  async signedDownloadUrl(key: string, filename: string): Promise<string> {
    const [url] = await this.file(key).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + this.config.downloadUrlTtlSeconds * 1000,
      responseDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
    });
    return url;
  }

  async signedUploadUrl(key: string, contentType: string): Promise<string> {
    const [url] = await this.file(key).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + this.config.uploadUrlTtlSeconds * 1000,
      // Pins the header the browser must send. Note this pins TYPE only — size
      // cannot be constrained by a signed URL, which is why confirmLogo checks
      // it after the fact.
      contentType,
    });
    return url;
  }
}
