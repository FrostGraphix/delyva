import { createHash, createHmac } from 'node:crypto';
import type { StorageProvider, StoredObject } from './storage.js';

/** S3 adapter configuration (from env; credentials come from the task role / Secrets Manager). */
export interface S3Config {
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  /** Path-style endpoint (MinIO, LocalStack). Empty → virtual-hosted AWS endpoint. */
  readonly endpoint?: string;
  /** Explicit virtual-hosted origin (tests); overrides the derived AWS host. */
  readonly virtualHostOrigin?: string;
}

const encode = (s: string): string =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const encodePath = (p: string): string => p.split('/').map(encode).join('/');
const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac('sha256', key).update(data, 'utf8').digest();
const sha256Hex = (data: string): string => createHash('sha256').update(data, 'utf8').digest('hex');

/**
 * S3 storage using AWS Signature Version 4 query presigning (no AWS SDK dependency).
 * Objects are private (bucket policy: block public access, SSE-KMS default encryption).
 * DEBT(storage): presigned PUT cannot cap object size — S3 needs a POST policy with
 * content-length-range — size is re-checked via HEAD on confirmation; switch to POST policy.
 * DEBT(storage): verified against the AWS SigV4 documentation test vector only, not a live bucket.
 */
export class S3Storage implements StorageProvider {
  private readonly origin: string;
  private readonly host: string;
  private readonly pathPrefix: string;

  /** @param config bucket, region, credentials */
  constructor(private readonly config: S3Config) {
    if (config.endpoint) {
      this.origin = config.endpoint.replace(/\/$/, '');
      this.pathPrefix = `/${config.bucket}`;
    } else {
      this.origin =
        config.virtualHostOrigin ?? `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
      this.pathPrefix = '';
    }
    this.host = new URL(this.origin).host;
  }

  /**
   * Builds a SigV4 presigned URL. `signedHeaders` must be sent verbatim by the caller.
   * @param now injectable for the documentation test vector
   */
  presign(
    method: 'GET' | 'PUT' | 'HEAD',
    key: string,
    expiresInSeconds: number,
    extraHeaders: Record<string, string> = {},
    now = new Date(),
  ): string {
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = amzDate.slice(0, 8);
    const scope = `${day}/${this.config.region}/s3/aws4_request`;
    const headers: Record<string, string> = { host: this.host, ...extraHeaders };
    const names = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.config.accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': names.join(';'),
      ...(this.config.sessionToken ? { 'X-Amz-Security-Token': this.config.sessionToken } : {}),
    };
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((k) => `${encode(k)}=${encode(query[k] ?? '')}`)
      .join('&');
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const canonicalHeaders = names.map((n) => `${n}:${(lower[n] ?? '').trim()}\n`).join('');
    const path = `${this.pathPrefix}/${encodePath(key)}`;
    const canonical = [
      method,
      path,
      canonicalQuery,
      canonicalHeaders,
      names.join(';'),
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
    let signingKey = hmac(`AWS4${this.config.secretAccessKey}`, day);
    for (const part of [this.config.region, 's3', 'aws4_request'])
      signingKey = hmac(signingKey, part);
    const signature = createHmac('sha256', signingKey).update(toSign, 'utf8').digest('hex');
    return `${this.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  /** @inheritdoc */
  presignPut(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; headers: Record<string, string> }> {
    const headers = { 'content-type': input.contentType };
    return Promise.resolve({
      url: this.presign('PUT', input.key, input.expiresInSeconds, headers),
      headers,
    });
  }

  /** @inheritdoc */
  presignGet(input: { key: string; expiresInSeconds: number }): Promise<{ url: string }> {
    return Promise.resolve({ url: this.presign('GET', input.key, input.expiresInSeconds) });
  }

  /** @inheritdoc */
  async stat(key: string): Promise<StoredObject | null> {
    const res = await fetch(this.presign('HEAD', key, 60), {
      method: 'HEAD',
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 403) return null;
    if (!res.ok) throw new Error(`s3 HEAD failed with ${String(res.status)}`);
    return {
      sizeBytes: Number(res.headers.get('content-length') ?? '0'),
      contentType: res.headers.get('content-type'),
    };
  }

  /** @inheritdoc */
  async read(key: string, maxBytes: number): Promise<Buffer> {
    const res = await fetch(this.presign('GET', key, 60), {
      headers: { range: `bytes=0-${String(maxBytes - 1)}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`s3 GET failed with ${String(res.status)}`);
    return Buffer.from(await res.arrayBuffer()).subarray(0, maxBytes);
  }
}
