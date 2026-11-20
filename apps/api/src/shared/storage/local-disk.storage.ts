import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { StorageProvider, StoredObject } from './storage.js';

/** Path of the dev upload endpoint served by the API (see onboarding `LocalUploadsController`). */
export const LOCAL_UPLOAD_PATH = '/v1/uploads/content';

const KEY_PATTERN = /^[a-z0-9_-]+\/[0-9a-f-]{36}$/;

/** Query parameters of a signed local URL. */
export interface LocalSignedParams {
  readonly key: string;
  readonly exp: string;
  readonly ct: string;
  readonly sig: string;
}

/**
 * Local-disk storage for development and tests. Signed URLs point at the API itself
 * (`PUT|GET /v1/uploads/content?key&exp&ct&sig`, HMAC-SHA256 over method, key, expiry and
 * content type). Never enabled in production (env validation).
 */
export class LocalDiskStorage implements StorageProvider {
  /** @param config root folder, public API origin and HMAC secret */
  constructor(
    private readonly config: { rootDir: string; publicBaseUrl: string; secret: string },
  ) {}

  private sign(method: string, key: string, exp: string, ct: string): string {
    return createHmac('sha256', this.config.secret)
      .update(`${method}\n${key}\n${exp}\n${ct}`)
      .digest('base64url');
  }

  private url(method: 'PUT' | 'GET', key: string, expiresInSeconds: number, ct: string): string {
    const exp = String(Math.floor(Date.now() / 1000) + expiresInSeconds);
    const qs = new URLSearchParams({ key, exp, ct, sig: this.sign(method, key, exp, ct) });
    return `${this.config.publicBaseUrl}${LOCAL_UPLOAD_PATH}?${qs.toString()}`;
  }

  /** @inheritdoc */
  presignPut(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; headers: Record<string, string> }> {
    return Promise.resolve({
      url: this.url('PUT', input.key, input.expiresInSeconds, input.contentType),
      headers: { 'content-type': input.contentType },
    });
  }

  /** @inheritdoc */
  presignGet(input: { key: string; expiresInSeconds: number }): Promise<{ url: string }> {
    return Promise.resolve({ url: this.url('GET', input.key, input.expiresInSeconds, '') });
  }

  /** True when the signature is valid and unexpired for `method`. */
  verify(method: 'PUT' | 'GET', p: LocalSignedParams, nowMs = Date.now()): boolean {
    if (!KEY_PATTERN.test(p.key) || !/^\d+$/.test(p.exp)) return false;
    if (Number(p.exp) * 1000 < nowMs) return false;
    const expected = Buffer.from(this.sign(method, p.key, p.exp, p.ct));
    const given = Buffer.from(p.sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private pathOf(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('local storage: invalid key');
    const root = resolve(this.config.rootDir);
    const full = resolve(join(root, key));
    if (!full.startsWith(root + sep)) throw new Error('local storage: path escapes root');
    return full;
  }

  /** Writes an object (called by the dev upload endpoint after signature + policy checks). */
  async write(key: string, body: Buffer, contentType: string): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    await writeFile(`${path}.meta.json`, JSON.stringify({ contentType }));
  }

  /** @inheritdoc */
  async stat(key: string): Promise<StoredObject | null> {
    const path = this.pathOf(key);
    try {
      const s = await stat(path);
      const meta = JSON.parse(await readFile(`${path}.meta.json`, 'utf8')) as {
        contentType?: unknown;
      };
      const contentType = typeof meta.contentType === 'string' ? meta.contentType : null;
      return { sizeBytes: s.size, contentType };
    } catch {
      return null;
    }
  }

  /** @inheritdoc */
  async read(key: string, maxBytes: number): Promise<Buffer> {
    const handle = await open(this.pathOf(key), 'r');
    try {
      const buf = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buf, 0, maxBytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }
}
