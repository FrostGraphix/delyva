import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  createOrder,
  devOtp,
  grantRoles,
  newPhone,
  otpRequestedAt,
  riderGoOnline,
  signIn,
  submitRiderApplication,
  submitVendorApplication,
  type Actor,
  waitForOtpCooldown,
} from './support/api';
import { base32Decode, hotp, nextTotp, totpStep } from './support/totp';

const SHOTS = path.join(__dirname, 'screenshots');
const RUN = String(Date.now()).slice(-6);
const RIDER_NAME = { first: 'Tunde', last: `Bakare${RUN}` };
const VENDOR_NAME = `Mama Put Kitchen ${RUN}`;
const AUTH_COOKIES = ['dl_admin_at', 'dl_admin_rt', 'dl_admin_2fa', 'dl_admin_csrf'];

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
let consoleErrors: string[] = [];
let opsPhone: string;
let refusedPhone: string;
let customer: Actor;
let rider: Actor;
let order: { id: string; ref: string };
let totpSecret: Buffer;
let enrolStep = 0;

async function shot(name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

function expectNoConsoleErrors(): void {
  expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
}

/** Phone OTP sign-in through the UI (waits out the API's per-phone resend cooldown first). */
async function loginWithOtp(phone: string): Promise<void> {
  await waitForOtpCooldown(phone);
  await page.goto('/login');
  await page.getByLabel('Phone number').fill(phone);
  otpRequestedAt.set(phone, Date.now());
  await page.getByRole('button', { name: 'Send code' }).click();
  const codeField = page.getByLabel('6-digit code sent by SMS');
  await expect(codeField).toBeVisible();
  await codeField.fill(await devOtp(phone));
  await page.getByRole('button', { name: 'Verify' }).click();
}

async function toast(text: string | RegExp): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  // Admin user: real OTP sign-in, then roles granted by SQL (no invite flow exists yet).
  opsPhone = newPhone();
  const ops = await signIn(opsPhone);
  await grantRoles(ops.userId, ['ops', 'super_admin']);

  refusedPhone = newPhone();
  customer = await signIn(newPhone());
  order = await createOrder(customer);

  rider = await signIn(newPhone());
  await submitRiderApplication(rider, RIDER_NAME.first, RIDER_NAME.last);
  const owner = await signIn(newPhone());
  await submitVendorApplication(owner, VENDOR_NAME);

  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.includes('favicon')) {
      consoleErrors.push(`${m.text()} @ ${m.location().url}`);
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
});

test.afterAll(async () => {
  await context.close();
});

test('A01 login: customer-role user is refused and gets no cookies', async () => {
  await loginWithOtp(refusedPhone);
  await expect(page.getByText('This account does not have console access.')).toBeVisible();
  const names = (await context.cookies()).map((c) => c.name);
  expect(names).not.toContain('dl_admin_at');
  expect(names).not.toContain('dl_admin_rt');
  await shot('01-login-customer-refused');
  await page.goto('/overview');
  await expect(page).toHaveURL(/\/login/);
  consoleErrors = [];
});

test('A01 login: phone OTP then TOTP enrolment and confirmation', async () => {
  await loginWithOtp(opsPhone);
  await expect(page.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible();
  await shot('02-login-totp-step');
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  const secret = await page.getByTestId('totp-secret').innerText();
  totpSecret = base32Decode(secret.trim());
  await shot('03-login-totp-enrolment');
  enrolStep = totpStep(Date.now());
  await page.getByLabel('Authenticator code').fill(hotp(totpSecret, enrolStep));
  await page.getByRole('button', { name: 'Confirm and continue' }).click();
  await expect(page).toHaveURL(/\/overview/);
  expectNoConsoleErrors();
});

test('auth cookies are httpOnly, Secure, SameSite=Strict and invisible to scripts', async () => {
  const cookies = await context.cookies();
  for (const name of AUTH_COOKIES) {
    const c = cookies.find((x) => x.name === name);
    expect(c, `cookie ${name}`).toBeDefined();
    expect(c?.httpOnly, `${name} httpOnly`).toBe(true);
    expect(c?.secure, `${name} secure`).toBe(true);
    expect(c?.sameSite, `${name} sameSite`).toBe('Strict');
  }
  const visible = await page.evaluate(() => document.cookie);
  expect(visible).not.toContain('dl_admin');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/eyJ|dl_admin/);
});

test('CSRF: a mutation without the token or from another origin is refused', async () => {
  const noToken = await page.request.post('/bff/v1/admin/feature-flags', {
    data: {},
    headers: { origin: 'http://localhost:3332' },
  });
  expect(noToken.status()).toBe(403);
  const crossOrigin = await page.request.post('/bff/v1/admin/feature-flags', {
    data: {},
    headers: { origin: 'https://evil.example' },
  });
  expect(crossOrigin.status()).toBe(403);
});

test('security headers: CSP, frame-ancestors none, nosniff', async () => {
  const res = await page.request.get('/login');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("default-src 'self'");
  expect(res.headers()['x-frame-options']).toBe('DENY');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
});

test('A02 overview: KPIs from real endpoints, debt tiles for missing reporting', async () => {
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  await expect(page.getByText('Orders today')).toBeVisible();
  await expect(page.getByText('Rider applications to review')).toBeVisible();
  await expect(page.getByText('Needs reporting endpoint').first()).toBeVisible();
  await expect(page.getByText('Loading')).toHaveCount(0);
  await shot('04-overview');
  expectNoConsoleErrors();
});

test('A03 live ops: the API-created order is listed, filters work, empty state shows', async () => {
  await page.goto('/live');
  await expect(page.getByRole('link', { name: `Open order ${order.ref}` })).toBeVisible();
  await shot('05-live-ops');
  await page.getByLabel('Status').selectOption('DELIVERED');
  await expect(page.getByText('No orders match these filters')).toBeVisible();
  await shot('06-live-ops-empty-filter');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('link', { name: `Open order ${order.ref}` })).toBeVisible();
  await expect(page.getByText('No riders online')).toBeVisible();
  expectNoConsoleErrors();
});

test('A04 order detail: manual-assign dialog, then ops cancel requires a reason', async () => {
  await page.getByRole('link', { name: `Open order ${order.ref}` }).click();
  await expect(page.getByRole('heading', { name: `Order ${order.ref}` })).toBeVisible();
  await shot('07-order-detail');

  await page.getByRole('button', { name: 'Assign rider' }).click();
  const assign = page.getByRole('dialog', { name: /Assign a rider/ });
  await expect(assign.getByText('No online riders without an active trip.')).toBeVisible();
  await expect(assign.getByRole('button', { name: 'Assign rider' })).toBeDisabled();
  await shot('08-order-assign-dialog');
  await assign.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Cancel order' }).click();
  const dialog = page.getByRole('dialog', { name: /Cancel order/ });
  await dialog.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await expect(dialog.getByText('Write at least 5 characters.')).toBeVisible();
  await shot('09-order-cancel-reason-required');
  await dialog.getByLabel('Reason (for the audit log)').fill('Customer asked to cancel by phone');
  await dialog.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await toast(`Order ${order.ref} cancelled`);
  // Ops cancel of a wallet-paid order releases the hold, so the order settles in REFUNDED.
  await expect(page.getByText('Refunded').first()).toBeVisible();
  await expect(
    page.getByText('This order is closed; no interventions are possible.'),
  ).toBeVisible();
  await shot('10-order-cancelled');
  expectNoConsoleErrors();
});

test('A07 riders: application approve with a reason (documents via signed URL)', async () => {
  await page.goto('/riders');
  const name = `${RIDER_NAME.first} ${RIDER_NAME.last}`;
  await expect(page.getByRole('button', { name: `Review ${name}` })).toBeVisible();
  await shot('11-riders-queue');
  await page.getByRole('button', { name: `Review ${name}` }).click();
  await expect(page.getByRole('heading', { name: `Review ${name}` })).toBeVisible();
  await expect(page.getByText('Verified').first()).toBeVisible();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Document 1' }).click();
  const doc = await popup;
  expect(doc.url()).toContain('/v1/uploads/content');
  await doc.close();
  await shot('12-rider-review');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Approve ${name}` });
  await dialog.getByLabel('Reason (for the audit log)').fill('KYC verified; bank name reviewed');
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
  await toast(`${name} approved`);
  await expect(page.getByText('No rider applications here')).toBeVisible();
  await shot('13-riders-after-approve');
  expectNoConsoleErrors();

  // The approved rider goes online and shows up on the live ops plot.
  await riderGoOnline(rider);
  await page.goto('/live');
  await expect(
    page.getByRole('img', { name: /online rider positions/ }).locator('circle'),
  ).toHaveCount(1);
  await shot('14-live-ops-with-rider');
  expectNoConsoleErrors();
});

test('A05/A06 merchants: vendor application approve with a reason', async () => {
  await page.goto('/merchants');
  await expect(page.getByRole('button', { name: `Review ${VENDOR_NAME}` })).toBeVisible();
  await shot('15-merchants-queue');
  await page.getByRole('button', { name: `Review ${VENDOR_NAME}` }).click();
  await expect(page.getByRole('heading', { name: `Review ${VENDOR_NAME}` })).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Approve ${VENDOR_NAME}` });
  await dialog.getByLabel('Reason (for the audit log)').fill('CAC, ID and menu reviewed');
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
  await toast(`${VENDOR_NAME} approved`);
  await expect(page.getByText('No merchant applications here')).toBeVisible();
  await shot('16-merchants-after-approve');
  expectNoConsoleErrors();
});

test('A08/A09 pricing: edit a fee rule, create a surge window and a promo', async () => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Delivery fee rules' })).toBeVisible();
  await shot('17-pricing');
  await page
    .getByRole('button', { name: /^Edit .* fee rule$/ })
    .first()
    .click();
  const fee = page.getByRole('dialog', { name: /fee rule/ });
  await fee.getByLabel('Base fee (₦)').fill('650');
  await fee.getByRole('button', { name: 'Save' }).click();
  await toast(/fee rule saved/);
  await expect(page.getByRole('cell', { name: '₦650' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'New surge window' }).first().click();
  const surge = page.getByRole('dialog', { name: 'New surge window' });
  await surge.getByRole('button', { name: 'Create' }).click();
  await toast('Surge window created');

  const code = `E2E${RUN}`;
  await page.getByRole('button', { name: 'New promo' }).click();
  const promo = page.getByRole('dialog', { name: 'New promo' });
  await promo.getByLabel('Code (A–Z, 0–9, _ or -)').fill(code);
  await promo.getByLabel('Starts').fill('2026-12-01T00:00');
  await promo.getByLabel('Ends').fill('2027-12-31T23:59');
  await shot('18-pricing-new-promo');
  await promo.getByRole('button', { name: 'Create' }).click();
  await toast(`Promo ${code} created`);
  await expect(page.getByRole('cell', { name: code })).toBeVisible();
  await shot('19-pricing-after');
  expectNoConsoleErrors();
});

test('feature flags (super_admin): create then toggle with a reason', async () => {
  await page.goto('/flags');
  await expect(page.getByRole('heading', { name: 'Feature flags', level: 1 })).toBeVisible();
  const key = `e2e.flag_${RUN}`;
  await page.getByLabel('Key (lowercase, dots allowed)').fill(key);
  await page.getByLabel('Description').fill('Created by the admin-web E2E');
  await page.getByLabel('Enabled').check();
  await page.getByRole('button', { name: 'Create' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Reason (for the audit log)').fill('E2E flag creation');
  await create.getByRole('button', { name: 'Confirm' }).click();
  await toast(`${key} is now Enabled`);
  await shot('20-flags-created');

  await page.getByRole('button', { name: `Disable ${key}` }).click();
  const toggle = page.getByRole('dialog');
  await toggle.getByLabel('Reason (for the audit log)').fill('E2E flag toggle off');
  await toggle.getByRole('button', { name: 'Confirm' }).click();
  await toast(`${key} is now Disabled`);
  await expect(page.getByRole('button', { name: `Enable ${key}` })).toBeVisible();
  await shot('21-flags-toggled');
  expectNoConsoleErrors();
});

test('audit log page shows the documented DEBT state', async () => {
  await page.goto('/audit');
  await expect(page.getByText('no audit-log read endpoint', { exact: false })).toBeVisible();
  await shot('22-audit-debt');
  expectNoConsoleErrors();
});

test('responsive: 1024 px layout has no horizontal page scroll; offline banner shows', async () => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/live');
  await expect(page.getByRole('heading', { name: 'Live operations' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await shot('23-live-1024');
  await context.setOffline(true);
  await expect(page.getByText('You are offline')).toBeVisible();
  await shot('24-offline-banner');
  await context.setOffline(false);
  await expect(page.getByText('You are offline')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  consoleErrors = [];
});

test('logout clears the session; sign-in again works with a fresh TOTP code', async () => {
  await page.goto('/overview');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  const names = (await context.cookies()).map((c) => c.name);
  for (const n of ['dl_admin_at', 'dl_admin_rt', 'dl_admin_2fa']) expect(names).not.toContain(n);
  await page.goto('/pricing');
  await expect(page).toHaveURL(/\/login/);
  await shot('25-after-logout');

  await loginWithOtp(opsPhone);
  await expect(page.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible();
  await page.getByLabel('Authenticator code').fill(await nextTotp(totpSecret, enrolStep));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/overview/);
  await shot('26-relogin-overview');
  expectNoConsoleErrors();
});
