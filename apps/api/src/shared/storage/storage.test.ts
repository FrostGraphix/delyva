import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalDiskStorage } from './local-disk.storage.js';
import { S3Storage } from './s3.storage.js';

describe('S3Storage SigV4 presign', () => {
  it('matches the AWS documentation presigned-URL example signature', () => {
    // "Authenticating Requests: Using Query Parameters (AWS Signature Version 4)" example.
    const s3 = new S3Storage({
      bucket: 'examplebucket',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      virtualHostOrigin: 'https://examplebucket.s3.amazonaws.com',
    });
    const url = s3.presign('GET', 'test.txt', 86_400, {}, new Date('2013-05-24T00:00:00Z'));
    expect(url).toContain(
      'X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request',
    );
    expect(url).toMatch(
      /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/,
    );
  });

  it('signs content-type on PUT and uses path style with a custom endpoint', async () => {
    const s3 = new S3Storage({
      bucket: 'b',
      region: 'eu-west-1',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      sessionToken: 'TOKEN',
      endpoint: 'http://127.0.0.1:9000/',
    });
    const put = await s3.presignPut({
      key: 'selfie/x',
      contentType: 'image/jpeg',
      expiresInSeconds: 600,
    });
    expect(put.url.startsWith('http://127.0.0.1:9000/b/selfie/x?')).toBe(true);
    expect(put.url).toContain('X-Amz-SignedHeaders=content-type%3Bhost');
    expect(put.url).toContain('X-Amz-Security-Token=TOKEN');
    expect(put.headers).toEqual({ 'content-type': 'image/jpeg' });
    expect((await s3.presignGet({ key: 'selfie/x', expiresInSeconds: 60 })).url).toContain(
      'X-Amz-Expires=60',
    );
  });
});

describe('LocalDiskStorage', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });
  const make = async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'delyva-storage-'));
    dirs.push(rootDir);
    return new LocalDiskStorage({
      rootDir,
      publicBaseUrl: 'http://api.test',
      secret: 's'.repeat(32),
    });
  };
  const key = 'selfie/0b6c1d1e-8a43-4bd3-9b55-4f3b5f0f6a11';
  const params = (url: string) => {
    const q = new URL(url).searchParams;
    return {
      key: q.get('key') ?? '',
      exp: q.get('exp') ?? '',
      ct: q.get('ct') ?? '',
      sig: q.get('sig') ?? '',
    };
  };

  it('issues verifiable, method-bound, expiring URLs', async () => {
    const s = await make();
    const { url } = await s.presignPut({ key, contentType: 'image/png', expiresInSeconds: 60 });
    const p = params(url);
    expect(s.verify('PUT', p)).toBe(true);
    expect(s.verify('GET', p)).toBe(false);
    expect(s.verify('PUT', { ...p, ct: 'image/jpeg' })).toBe(false);
    expect(s.verify('PUT', p, Date.now() + 120_000)).toBe(false);
    expect(s.verify('PUT', { ...p, key: '../etc/passwd' })).toBe(false);
  });

  it('writes, stats and reads objects; missing objects stat to null', async () => {
    const s = await make();
    expect(await s.stat(key)).toBeNull();
    await s.write(key, Buffer.from('hello world'), 'text/csv');
    expect(await s.stat(key)).toEqual({ sizeBytes: 11, contentType: 'text/csv' });
    expect((await s.read(key, 5)).toString()).toBe('hello');
    expect(s.verify('GET', params((await s.presignGet({ key, expiresInSeconds: 60 })).url))).toBe(
      true,
    );
    await expect(s.write('bad key', Buffer.from(''), 'x')).rejects.toThrow();
  });
});
