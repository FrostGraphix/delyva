/** Fixed E2E topology (own DB and Redis db; never shared with other agents). */
export const API_PORT = 3320;
export const WEB_PORT = 3321;
export const API_URL = `http://127.0.0.1:${String(API_PORT)}`;
export const WEB_URL = `http://127.0.0.1:${String(WEB_PORT)}`;
export const DB_NAME = 'delyva_custapp_e2e';
export const ADMIN_DB_URL = 'postgres://delyva:delyva_local_only@127.0.0.1:55432/postgres';
export const DATABASE_URL = `postgres://delyva:delyva_local_only@127.0.0.1:55432/${DB_NAME}`;
export const REDIS_URL = 'redis://127.0.0.1:56379/7';
export const WEBHOOK_SECRET = 'e2e-fake-webhook-secret';
/** Seeded demo vendor owner (apps/api/scripts/seed-catalog.ts). */
export const OWNER_PHONE = '+2348000000001';
