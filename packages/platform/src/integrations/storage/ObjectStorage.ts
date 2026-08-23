/** What a stored object reports about itself. */
export interface StoredObject {
  contentType: string;
  byteSize: number;
}

/**
 * Port for durable blob storage. Named by capability, not vendor — GCS sits
 * behind it today.
 *
 * The signed-URL methods exist so bytes never pass through the API: a browser
 * downloads a rendered PDF straight from storage and PUTs a logo straight to it.
 * `head` is what makes an upload safe — a signed PUT URL can pin content-type
 * but CANNOT enforce size, so the size check has to happen after the fact, and
 * `remove` is how a rejected upload is cleaned up.
 */
export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  /** Metadata without the body, or null if the object doesn't exist. */
  head(key: string): Promise<StoredObject | null>;
  remove(key: string): Promise<void>;
  /** Time-limited read URL. `filename` sets the browser's download name. */
  signedDownloadUrl(key: string, filename: string): Promise<string>;
  /** Time-limited write URL, pinned to `contentType`. */
  signedUploadUrl(key: string, contentType: string): Promise<string>;
}
