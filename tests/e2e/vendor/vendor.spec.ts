import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { CUSTOMER_PHONE, FRESH_PHONE, OWNER_PHONE, VENDOR_ID } from './env';
import { customerToken, loginViaUi, placeWalletOrder, publicVendor } from './helpers';

const SHOTS = join(import.meta.dirname, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${String(r.status())} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  page.on('console', (m) => {
    // Failed network loads are recorded precisely (method, path, status) by the response listener above.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

const shot = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

test.describe.configure({ mode: 'serial' });

test('seeded owner: login -> live board -> order lifecycle -> menu -> hours -> earnings -> settings -> logout', async ({
  page,
  context,
}) => {
  const errors = watchConsole(page);

  await test.step('login page renders and rejects a bad number', async () => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Phone number').fill('12345');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('Enter a valid Nigerian mobile number.')).toBeVisible();
    await shot(page, '01-login');
  });

  await test.step('OTP login as the seeded owner', async () => {
    await loginViaUi(page, OWNER_PHONE, /\/orders$/);
    await expect(page.getByRole('heading', { name: 'Orders board' })).toBeVisible();
  });

  await test.step('tokens are not reachable from browser JS (httpOnly cookies)', async () => {
    const cookies = await context.cookies();
    const at = cookies.find((c) => c.name === 'dv_at');
    const rt = cookies.find((c) => c.name === 'dv_rt');
    expect(at?.httpOnly).toBe(true);
    expect(rt?.httpOnly).toBe(true);
    expect(at?.sameSite).toBe('Lax');
    expect(cookies.find((c) => c.name === 'dv_csrf')?.httpOnly).toBe(false);
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain('dv_at');
    expect(visible).not.toContain('dv_rt');
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toMatch(/eyJ/);
  });

  await test.step('board empty state', async () => {
    await expect(page.getByText('No live orders')).toBeVisible();
    await shot(page, '02-board-empty');
  });

  const token = await customerToken(CUSTOMER_PHONE);
  const order = await placeWalletOrder(token, VENDOR_ID);

  await test.step('new order alert appears live without reload', async () => {
    await expect(page.getByRole('alert').filter({ hasText: 'New order!' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('article', { name: `Order ${order.ref}` })).toBeVisible();
    await expect(page.getByText(/Auto-rejects in/)).toBeVisible();
    await shot(page, '03-board-new-order-alert');
  });

  const card = page.getByRole('article', { name: `Order ${order.ref}` });

  await test.step('accept with a prep time', async () => {
    await card.getByRole('button', { name: 'Accept', exact: true }).click();
    await page.getByRole('button', { name: '20 min' }).click();
    await shot(page, '04-accept-dialog');
    await page.getByRole('button', { name: 'Accept · 20 min' }).click();
    await expect(page.getByText(`Order ${order.ref} accepted`)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Start preparing' })).toBeVisible();
  });

  await test.step('preparing then ready; pickup code visible', async () => {
    await card.getByRole('button', { name: 'Start preparing' }).click();
    await expect(card.getByRole('button', { name: 'Mark ready' })).toBeVisible();
    await card.getByRole('button', { name: 'Mark ready' }).click();
    await expect(card.getByText('Waiting for rider')).toBeVisible();
    await expect(card.getByText(/Pickup code:\s*\d{4}/)).toBeVisible();
    await shot(page, '05-board-ready');
  });

  await test.step('order detail', async () => {
    await card.getByRole('link', { name: `#${order.ref}` }).click();
    await expect(page.getByRole('heading', { name: `Order ${order.ref}` })).toBeVisible();
    await expect(page.getByTestId('pickup-code')).toHaveText(/^\d{4}$/);
    await expect(page.getByText('Timeline')).toBeVisible();
    await shot(page, '06-order-detail');
  });

  const first = (await publicVendor(VENDOR_ID)).menu.categories.flatMap((c) => c.items)[0];
  if (!first) throw new Error('no menu item');

  await test.step('menu manager: edit price and toggle availability (verified via public API)', async () => {
    await page.getByRole('link', { name: 'Menu' }).first().click();
    await expect(page.getByRole('heading', { name: 'Menu', exact: true })).toBeVisible();
    await shot(page, '07-menu');
    await page.getByRole('button', { name: `Edit ${first.name}` }).click();
    await page.getByLabel('Price (₦)').fill('2600');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`${first.name} saved`)).toBeVisible();
    await expect
      .poll(async () => (await publicVendor(VENDOR_ID)).menu.categories.flatMap((c) => c.items).find((i) => i.id === first.id)?.price.amountMinor)
      .toBe(260_000);

    await page.getByRole('switch', { name: `${first.name} available` }).click();
    await expect(page.getByText(`${first.name} marked sold out`)).toBeVisible();
    await expect
      .poll(async () => (await publicVendor(VENDOR_ID)).menu.categories.flatMap((c) => c.items).find((i) => i.id === first.id)?.available)
      .toBe(false);
    await shot(page, '08-menu-after-edit');
  });

  await test.step('opening hours: close Sunday and save', async () => {
    await page.getByRole('link', { name: 'Opening hours' }).first().click();
    await expect(page.getByRole('heading', { name: 'Opening hours' })).toBeVisible();
    await page.getByRole('switch', { name: 'Sunday Open' }).click();
    await shot(page, '09-hours');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Opening hours saved')).toBeVisible();
    await expect
      .poll(async () => (await publicVendor(VENDOR_ID)).branches[0]?.openingHours.some((h) => h.dayOfWeek === 0))
      .toBe(false);
  });

  await test.step('earnings', async () => {
    await page.getByRole('link', { name: 'Earnings' }).first().click();
    await expect(page.getByRole('heading', { name: 'Earnings', exact: true })).toBeVisible();
    await expect(page.getByText('No delivered orders yet')).toBeVisible();
    await shot(page, '10-earnings');
  });

  await test.step('settings and logout', async () => {
    await page.getByRole('link', { name: 'Settings' }).first().click();
    await expect(page.getByRole('heading', { name: 'Store settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await shot(page, '11-settings-dark');
    await page.getByRole('button', { name: 'Sign out' }).last().click();
    await expect(page).toHaveURL(/\/login$/);
    const names = (await context.cookies()).map((c) => c.name);
    expect(names).not.toContain('dv_rt');
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login$/);
  });

  expect(errors).toEqual([]);
});

test('CSRF: a mutating BFF call without the token or with a foreign origin is refused', async ({ page, request }) => {
  await loginViaUi(page, OWNER_PHONE, /\/orders$/);
  const noToken = await page.request.post('/api/v1/vendor-orders/0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11/ready', {
    headers: { origin: 'http://127.0.0.1:3331' },
  });
  expect(noToken.status()).toBe(403);
  const foreign = await request.post('/api/auth/otp/request', {
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    data: { phone: OWNER_PHONE },
  });
  expect(foreign.status()).toBe(403);
});

test('fresh vendor completes the onboarding wizard to submission', async ({ page }) => {
  const errors = watchConsole(page);
  await loginViaUi(page, FRESH_PHONE, /\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'Set up your store' })).toBeVisible();
  await shot(page, '20-onboarding-business');

  await page.getByLabel('Business name').fill('Ada Test Kitchen');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await page.getByLabel('CAC registration number').fill('RC123456');
  const pdf = { name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') };
  await page.getByLabel('CAC certificate (PDF or photo)').setInputFiles(pdf);
  await page.getByLabel('ID number').fill('NIN12345678');
  await page.getByLabel('Photo of the ID').setInputFiles(pdf);
  await expect(page.getByText('Uploaded')).toHaveCount(2);
  await shot(page, '21-onboarding-documents');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page.getByRole('heading', { name: 'Location and hours' })).toBeVisible();
  await page.getByLabel('Branch name').fill('Yaba');
  await page.getByLabel('Street address').fill('12 Herbert Macaulay Way, Yaba');
  await page.getByLabel('Latitude').fill('6.509');
  await page.getByLabel('Longitude').fill('3.378');
  await shot(page, '22-onboarding-location');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page.getByRole('heading', { name: 'Menu', exact: true })).toBeVisible();
  const bad = 'category,name,description,price_naira,available\nRice,Jollof,Party jollof,abc,yes\n';
  await page.getByLabel('Menu CSV file').setInputFiles({ name: 'menu.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) });
  await expect(page.getByText('Uploaded')).toBeVisible();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Fix these lines in your file')).toBeVisible();
  await expect(page.getByText(/line 2/i)).toBeVisible();
  await shot(page, '23-onboarding-menu-errors');
  const good = 'category,name,description,price_naira,available\nRice,Jollof,Party jollof,3500,yes\n';
  await page.getByLabel('Menu CSV file').setInputFiles({ name: 'menu.csv', mimeType: 'text/csv', buffer: Buffer.from(good) });
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page.getByRole('heading', { name: 'Bank account' })).toBeVisible();
  await page.getByLabel('Bank code').fill('058');
  await page.getByLabel('Account number (10 digits)').fill('0123456789');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText(/does not match your business/i)).toBeVisible();
  await shot(page, '24-onboarding-bank-mismatch');
  await page.getByRole('button', { name: 'Confirm and send for review' }).click();

  await expect(page.getByRole('heading', { name: 'Test order' })).toBeVisible();
  for (const label of ['I accepted the test order', 'I marked an item unavailable', 'I marked the test order ready', 'I reviewed the payout schedule']) {
    await page.getByLabel(label).check();
  }
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page.getByRole('heading', { name: 'Submit', exact: true })).toBeVisible();
  await shot(page, '25-onboarding-submit');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page).toHaveURL(/\/onboarding\/status$/);
  await expect(page.getByText('Under review')).toBeVisible();
  await shot(page, '26-onboarding-status');
  // Only the failures this test provokes on purpose (plus the shell's vendor lookup, which is 403 for a user with no store yet).
  expect(errors).toEqual([
    'http 403 GET /api/v1/me/vendors',
    'http 400 POST /api/v1/vendor-applications/me/menu-import',
    'http 422 PUT /api/v1/vendor-applications/me/bank-account',
  ]);
});
