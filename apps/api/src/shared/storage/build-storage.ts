import { createHmac } from 'node:crypto';
import type { Env } from '../config/env.js';
import { LocalDiskStorage } from './local-disk.storage.js';
import { S3Storage } from './s3.storage.js';
import type { StorageProvider } from './storage.js';

/** Builds the configured {@link StorageProvider} (S3 in production, local disk otherwise). */
export function buildStorage(env: Env): StorageProvider {
  if (env.STORAGE_PROVIDER === 's3') {
    return new S3Storage({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      ...(env.S3_SESSION_TOKEN ? { sessionToken: env.S3_SESSION_TOKEN } : {}),
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    });
  }
  const secret =
    env.STORAGE_SIGNING_SECRET ||
    createHmac('sha256', env.HASH_PEPPER).update('local-storage-signing').digest('hex');
  return new LocalDiskStorage({
    rootDir: env.STORAGE_LOCAL_DIR,
    publicBaseUrl: env.PUBLIC_API_URL.replace(/\/$/, ''),
    secret,
  });
}
