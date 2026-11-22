/** Shared constants for the vendor-web E2E suite (own DB, Redis db 5, ports 3322 / 3331). */
export const API_PORT = 3342;
export const WEB_PORT = 3331;
export const API_URL = `http://127.0.0.1:${String(API_PORT)}`;
export const WEB_URL = `http://127.0.0.1:${String(WEB_PORT)}`;
export const ADMIN_PG_URL =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
export const DB_NAME = 'delyva_vendorweb_e2e';
export const DB_URL = ADMIN_PG_URL.replace(/\/[^/]+$/, `/${DB_NAME}`);
export const REDIS_URL = 'redis://127.0.0.1:56379/5';
export const BULLMQ_PREFIX = 'vendorweb-e2e';
export const PEPPER = 'e2e-vendorweb-pepper-0123456789abcdef0123';
export const WEBHOOK_SECRET = 'e2e-vendorweb-fake-webhook-secret';
export const OWNER_PHONE = '+2348000000001';
export const FRESH_PHONE = '+2348000000099';
export const CUSTOMER_PHONE = '+2348031230077';
/** Seeded vendor 1 (Mama Put Amala Spot) and its branch. */
export const VENDOR_ID = '20000000-0000-4000-8000-000000000' + '3e8';
export const BRANCH_ID = '21000000-0000-4000-8000-000000000' + '3e8';
