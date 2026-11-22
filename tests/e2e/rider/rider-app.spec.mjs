// Rider app click-through against the real API: OTP login → full application → ops approval →
// online → real dispatch offer → pickup code → offline-queued pickup → delivery OTP → summary →
// earnings → profile → report issue → offline. One screenshot per screen.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  approveRider,
  customerOrder,
  devOtp,
  DROPOFF,
  opsSession,
  placeWalletOrder,
  signIn,
  vendorAct,
} from './api-helpers.mjs';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SHOTS, { recursive: true });
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(512, 7)]);
const run = String(Date.now()).slice(-7);
const phone = (prefix) => `+234${prefix}${run}`;
const passed = [];

/** Screenshot + record that the screen rendered. */
async function shot(page, name) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  passed.push(name);
}

// Expo Router keeps earlier screens mounted (hidden), so test ids can repeat: only match visible ones.
const vis = (page, id) => page.locator(`[data-testid="${id}"]:visible`);
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function upload(page, label) {
  const chooser = page.waitForEvent('filechooser');
  await button(page, label).click();
  await (await chooser).setFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: JPEG });
}

test('rider: onboarding → approval → offer → delivery → earnings → profile → offline', async ({ page, context }) => {
  const consoleErrors = [];
  const resourceErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    process.stdout.write(`[browser-error] ${m.text().slice(0, 600)}\n`);
    (m.text().startsWith('Failed to load resource') ? resourceErrors : consoleErrors).push(m.text());
  });
  page.on('pageerror', (e) => {
    process.stdout.write(`[pageerror] ${e.message.slice(0, 600)}\n`);
    consoleErrors.push(`pageerror: ${e.message}`);
  });

  // ---------------------------------------------------------------- OTP sign-in
  const riderPhone = phone('803');
  await page.goto('/');
  await expect(vis(page, 'screen-phone')).toBeVisible();
  await shot(page, '01-sign-in-phone');
  await vis(page, 'phone-input').fill(`0${riderPhone.slice(4)}`);
  await button(page, 'Send code').click();
  await expect(vis(page, 'screen-otp')).toBeVisible();
  await expect(button(page, 'Verify')).toBeDisabled();
  await shot(page, '02-sign-in-otp');
  await vis(page, 'otp-input').fill((await devOtp(riderPhone)) ?? '');
  await button(page, 'Verify').click();

  // ---------------------------------------------------------------- application
  await expect(vis(page, 'screen-onb-personal')).toBeVisible();
  await button(page, 'Continue').click();
  await expect(page.getByText('Check the highlighted fields.')).toBeVisible();
  await vis(page, 'first-name').fill('Tunde');
  await vis(page, 'last-name').fill('Bakare');
  await vis(page, 'dob').fill('1995-04-12');
  await shot(page, '03-onboarding-personal');
  await button(page, 'Continue').click();

  await expect(vis(page, 'screen-onb-identity')).toBeVisible();
  await upload(page, 'Take a selfie');
  await expect(vis(page, 'selfie-done')).toBeVisible();
  await vis(page, 'nin').fill('12345678901');
  await shot(page, '04-onboarding-identity');
  await button(page, 'Continue').click();

  await expect(vis(page, 'screen-onb-vehicle')).toBeVisible();
  await vis(page, 'plate').fill('LND123AB');
  await vis(page, 'licence-number').fill('LAG12345');
  await vis(page, 'licence-expiry').fill('2029-01-01');
  await upload(page, "Upload driver's licence");
  await expect(vis(page, 'licence-doc-done')).toBeVisible();
  await upload(page, 'Upload vehicle photo');
  await expect(vis(page, 'vehicle-photo-done')).toBeVisible();
  await shot(page, '05-onboarding-vehicle');
  await button(page, 'Continue').click();

  await expect(vis(page, 'screen-onb-guarantor')).toBeVisible();
  await vis(page, 'guarantor-name').fill('Ada Obi');
  await vis(page, 'guarantor-phone').fill('08039990000');
  await vis(page, 'guarantor-relationship').fill('Aunt');
  await shot(page, '06-onboarding-guarantor');
  await button(page, 'Continue').click();

  await expect(vis(page, 'screen-onb-bank')).toBeVisible();
  await vis(page, 'bank-code').fill('058');
  await vis(page, 'account-number').fill('0123456789');
  await button(page, 'Continue').click();
  await expect(vis(page, 'name-mismatch')).toBeVisible();
  await shot(page, '07-onboarding-bank-mismatch');
  await button(page, 'Keep this account').click();

  await expect(vis(page, 'screen-onb-quiz')).toBeVisible();
  for (const [q, a] of [['q1', 'a'], ['q2', 'b'], ['q3', 'b'], ['q4', 'a'], ['q5', 'b']]) {
    await page.getByTestId(`quiz-${q}-${a}`).click();
  }
  await shot(page, '08-onboarding-quiz');
  await button(page, 'Submit answers').click();

  await expect(vis(page, 'screen-onb-review')).toBeVisible();
  await expect(vis(page, 'review-summary')).toContainText('Tunde Bakare');
  await shot(page, '09-onboarding-review');
  await button(page, 'Submit application').click();
  await expect(vis(page, 'status-pending')).toBeVisible();
  await shot(page, '10-application-pending');

  // ---------------------------------------------------------------- ops approval (API)
  const riderUserId = await page.evaluate(() => sessionStorage.getItem('delyva.rider.user'));
  const ops = await opsSession(phone('809'));
  await approveRider(ops, riderUserId);
  await button(page, 'Check status').click();
  await expect(vis(page, 'status-approved')).toBeVisible();
  await shot(page, '11-application-approved');
  await button(page, 'Start riding').click();

  // ---------------------------------------------------------------- home → online
  await expect(vis(page, 'screen-home')).toBeVisible();
  await expect(vis(page, 'shift-status')).toHaveText('You are offline');
  await expect(vis(page, 'battery')).toContainText('Battery');
  await shot(page, '12-home-offline');
  await button(page, 'Go online').click();
  await expect(vis(page, 'shift-status')).toHaveText('You are online');
  await expect(vis(page, 'waiting-panel')).toBeVisible();
  await shot(page, '13-home-online-waiting');

  // ---------------------------------------------------------------- real order → dispatch offer
  const customer = await signIn(phone('802'));
  const order = await placeWalletOrder(customer);
  const vendor = await signIn('+2348000000001');
  await vendorAct(vendor, order.id, 'accept', { prepMinutes: 1 });
  await expect(vis(page, 'screen-offer')).toBeVisible({ timeout: 150_000 });
  const left = Number(await vis(page, 'offer-countdown').textContent());
  expect(left).toBeGreaterThan(0);
  expect(left).toBeLessThanOrEqual(20);
  await expect(vis(page, 'offer-distance')).toBeVisible();
  await shot(page, '14-offer');
  await button(page, 'Accept').click();

  // ---------------------------------------------------------------- trip: store
  await expect(vis(page, 'trip-stage')).toHaveText('Head to the store');
  const ready = await vendorAct(vendor, order.id, 'ready');
  // Maps hand-off: capture the URL the app opens instead of loading google.com in CI.
  await page.evaluate(() => {
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(String(url));
      return null;
    };
  });
  await button(page, 'Open in Maps').click();
  await expect.poll(() => page.evaluate(() => window.__opened[0] ?? '')).toContain('google.com/maps/dir/?api=1&destination=6.43');
  await vis(page, 'handoff-code').fill(ready.pickupCode);
  await shot(page, '15-trip-to-store-pickup-code');
  await button(page, 'I have arrived — confirm code').click();
  await expect(vis(page, 'trip-stage')).toHaveText('At the store');
  await shot(page, '16-trip-at-store');

  // ---------------------------------------------------------------- offline queue: picked up
  await context.setOffline(true);
  await expect(vis(page, 'offline-banner')).toBeVisible();
  await button(page, 'Picked up').click();
  await expect(vis(page, 'trip-queued')).toBeVisible();
  await expect(vis(page, 'trip-stage')).toHaveText('Head to the customer');
  await shot(page, '17-trip-picked-up-queued-offline');
  await context.setOffline(false);
  await expect(vis(page, 'queue-banner')).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(async () => (await customerOrder(customer, order.id)).status, { timeout: 30_000 })
    .toBe('PICKED_UP');

  // ---------------------------------------------------------------- trip: customer
  await context.setGeolocation({ latitude: DROPOFF.lat, longitude: DROPOFF.lng, accuracy: 10 });
  await shot(page, '18-trip-to-customer');
  // The server judges distance from the rider's live position (updated every ~4.5 s on a trip),
  // so a rider who just moved retries until the fresh fix lands, as in the real flow.
  await expect(async () => {
    await button(page, 'I have arrived').click();
    await expect(vis(page, 'trip-stage')).toHaveText('At the customer', { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  const otp = (await customerOrder(customer, order.id)).deliveryOtp;
  await vis(page, 'handoff-code').fill('0000' === otp ? '1111' : '0000');
  await button(page, 'Complete delivery').click();
  await expect(vis(page, 'trip-error')).toHaveText('That code is not right. Ask again.');
  await vis(page, 'handoff-code').fill(otp);
  await shot(page, '19-trip-delivery-otp');
  await button(page, 'Complete delivery').click();
  await expect(vis(page, 'summary-delivered')).toBeVisible();
  await shot(page, '20-delivered-summary');
  expect((await customerOrder(customer, order.id)).status).toBe('DELIVERED');

  // ---------------------------------------------------------------- earnings / profile / issue
  await button(page, 'Back to home').click();
  await expect(vis(page, 'screen-home')).toBeVisible();
  await vis(page, 'nav-earnings').click();
  await expect(vis(page, 'earnings-trips')).toContainText('1');
  await shot(page, '21-earnings');
  await vis(page, 'nav-profile').click();
  await expect(vis(page, 'screen-profile')).toBeVisible();
  await shot(page, '22-profile');
  await vis(page, 'nav-issue').click();
  await expect(vis(page, 'sos-card')).toBeVisible();
  await shot(page, '23-report-issue');

  // ---------------------------------------------------------------- offline state
  await vis(page, 'nav-home').click();
  await context.setOffline(true);
  await expect(vis(page, 'offline-banner')).toBeVisible();
  await shot(page, '24-home-offline-network');
  await context.setOffline(false);

  process.stdout.write(`\nscreens passed (${String(passed.length)}):\n${passed.map((p) => `  ✓ ${p}`).join('\n')}\n`);
  process.stdout.write(`browser resource-load errors (expected 4xx/offline): ${String(resourceErrors.length)}\n`);
  expect(consoleErrors).toEqual([]);
});
