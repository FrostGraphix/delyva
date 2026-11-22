// Shared, local-only configuration for the rider E2E suite. Every value here is a throwaway test
// value for the docker-compose `delyva` services; nothing is a real secret.
const apiPort = 3321;
const webPort = 3322;
const dbName = 'delyva_riderapp_e2e';
const adminDbUrl = 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const dbUrl = adminDbUrl.replace(/\/[^/]+$/, `/${dbName}`);
const redisUrl = 'redis://127.0.0.1:56379/10';
const webOrigin = `http://127.0.0.1:${String(webPort)}`;
const webhookSecret = 'rider-e2e-fake-webhook-secret';

export const E2E = {
  apiPort,
  webPort,
  dbName,
  adminDbUrl,
  dbUrl,
  redisUrl,
  webOrigin,
  webhookSecret,
  apiEnv: {
    NODE_ENV: 'development',
    PORT: String(apiPort),
    LOG_LEVEL: 'warn',
    DATABASE_URL: dbUrl,
    REDIS_URL: redisUrl,
    HASH_PEPPER: 'rider-e2e-pepper-0123456789abcdef0123456789',
    JWT_ISSUER: 'https://api.delyva.e2e',
    JWT_AUDIENCE: 'delyva-apps',
    SMS_PROVIDER: 'dev',
    PAYMENTS_PROVIDER: 'fake',
    PAYMENTS_FAKE_WEBHOOK_SECRET: webhookSecret,
    KYC_PROVIDER: 'fake',
    STORAGE_PROVIDER: 'local',
    STORAGE_LOCAL_DIR: '.data/rider-e2e-uploads',
    // Signed upload URLs must be same-origin with the web build (served through the proxy).
    PUBLIC_API_URL: webOrigin,
    BULLMQ_PREFIX: 'rider-e2e',
    ORDERING_JOBS_ENABLED: 'true',
    DISPATCH_CONSUMER_ENABLED: 'true',
    DISPATCH_WORKER_ENABLED: 'true',
    NOTIFICATIONS_CONSUMER_ENABLED: 'false',
  },
};
