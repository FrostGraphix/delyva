/** DI token for the {@link StorageProvider}. */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/** Metadata of a stored object. */
export interface StoredObject {
  readonly sizeBytes: number;
  readonly contentType: string | null;
}

/**
 * Object storage behind signed, expiring URLs. All objects are private; clients only ever see
 * short-lived presigned URLs. Adapters: S3 (SigV4 presign) and local disk (dev/test).
 */
export interface StorageProvider {
  /** Presigned PUT; the client must send exactly `headers`. */
  presignPut(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  /** Presigned GET for reviewers. */
  presignGet(input: { key: string; expiresInSeconds: number }): Promise<{ url: string }>;
  /** Object metadata, or null when nothing was uploaded. */
  stat(key: string): Promise<StoredObject | null>;
  /** Reads up to `maxBytes` from the start of the object. */
  read(key: string, maxBytes: number): Promise<Buffer>;
}
