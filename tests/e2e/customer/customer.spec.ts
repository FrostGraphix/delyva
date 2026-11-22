import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { OWNER_PHONE } from './env.js';
import { apiCall, readDevOtp, sendChargeSuccess, signInViaOtp } from './helpers.js';

const SHOTS = join(import.meta.dirname, 'screenshots');
const CUSTOMER_PHONE = '+2348031234567';
const CUSTOMER_LOCAL = '8031234567';

/** Visible element by testID (stacked screens stay mounted, hidden, on web). */
function vis(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${id}"]:visible`);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

test('customer clicks through every screen against the real API', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => {
    consoleErrors.push(String(e));
  });
  let topUpReference = '';
  let orderId = '';
  page.on('response', async (r) => {
    if (r.url().endsWith('/v1/wallet/top-ups') && r.request().method() === 'POST') {
      topUpReference = ((await r.json()) as { reference: string }).reference;
    }
    if (r.url().endsWith('/v1/orders') && r.request().method() === 'POST' && r.ok()) {
      orderId = ((await r.json()) as { id: string }).id;
    }
  });
  page.context().on('page', (p) => {
    void p.close().catch(() => undefined); // provider checkout popup (fake host)
  });

  await test.step('C01 splash -> C02 welcome carousel', async () => {
    await page.goto('/');
    await expect(vis(page, 'welcome')).toBeVisible();
    await shot(page, '01-welcome');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();
    await shot(page, '02-welcome-last');
    await page.getByRole('button', { name: 'Get started' }).click();
  });

  await test.step('C06 location priming -> manual address', async () => {
    await expect(vis(page, 'location')).toBeVisible();
    await shot(page, '03-location-priming');
    await page.getByRole('button', { name: 'Enter address manually' }).click();
    await expect(vis(page, 'address')).toBeVisible();
    await vis(page, 'address-line1').fill('12 Admiralty Way');
    await vis(page, 'address-landmark').fill('Opposite the filling station');
    await vis(page, 'area-lekki').click();
    await shot(page, '04-address');
    await page.getByRole('button', { name: 'Deliver here' }).click();
  });

  await test.step('C08 home (guest browsing) + C09 search', async () => {
    await expect(vis(page, 'home')).toBeVisible();
    await expect(vis(page, 'home').getByRole('button', { name: /Jollof Junction/ })).toBeVisible();
    await shot(page, '05-home');
    await vis(page, 'tab-search').click();
    await vis(page, 'search-input').fill('jollof');
    await expect(
      vis(page, 'search').getByRole('button', { name: /Jollof Junction/ }),
    ).toBeVisible();
    await shot(page, '06-search-results');
    await vis(page, 'search-input').fill('zzzz');
    await expect(vis(page, 'search-empty')).toBeVisible();
    await shot(page, '07-search-empty');
    await vis(page, 'tab-home').click();
  });

  await test.step('C11 vendor page + C12 item sheet with modifiers', async () => {
    await vis(page, 'home')
      .getByRole('button', { name: /Jollof Junction/ })
      .click();
    await expect(vis(page, 'vendor')).toBeVisible();
    await page.getByRole('button', { name: 'Add Party jollof rice' }).click();
    await expect(vis(page, 'item-sheet')).toBeVisible();
    await page
      .getByRole('radio', { name: /^Beef/ })
      .or(page.getByRole('checkbox', { name: /^Beef/ }))
      .click();
    await page.getByRole('checkbox', { name: /^Chicken/ }).click();
    await page.getByRole('checkbox', { name: /^Fried fish/ }).click(); // over max (2): ignored
    await expect(page.getByRole('checkbox', { name: /^Fried fish/, checked: false })).toBeVisible();
    await shot(page, '08-item-sheet');
    await page.getByRole('button', { name: /^Add to cart/ }).click();
    await expect(page.getByRole('button', { name: /View cart/ })).toBeVisible();
    await shot(page, '09-vendor-with-cart');
    await page.getByRole('button', { name: /View cart/ }).click();
  });

  await test.step('C14 guest cart -> C03/C04 phone + OTP -> C05 first name', async () => {
    await expect(vis(page, 'cart')).toBeVisible();
    await expect(vis(page, 'cart').getByText('Party jollof rice')).toBeVisible();
    await shot(page, '10-cart-guest');
    await page.getByRole('button', { name: 'Sign in to checkout' }).click();
    await vis(page, 'login-phone').fill(CUSTOMER_LOCAL);
    await shot(page, '11-login');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(vis(page, 'otp-input')).toBeVisible();
    await shot(page, '12-otp');
    const code = await readDevOtp(CUSTOMER_PHONE);
    await vis(page, 'otp-input').fill(code);
    await expect(vis(page, 'name')).toBeVisible();
    await shot(page, '13-first-name');
    await vis(page, 'name-input').fill('Amaka');
    await page.getByRole('button', { name: 'Continue' }).click();
  });

  await test.step('C14 server cart (synced from guest cart)', async () => {
    await expect(vis(page, 'cart')).toBeVisible();
    await expect(vis(page, 'cart-subtotal')).toBeVisible();
    await shot(page, '14-cart-server');
    await page.getByRole('button', { name: 'Checkout' }).click();
  });

  await test.step('C15 checkout blocks an empty wallet -> C32 wallet top-up', async () => {
    await expect(vis(page, 'checkout')).toBeVisible();
    await expect(page.getByText(/Not enough in your wallet/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay / })).toBeDisabled();
    await shot(page, '15-checkout-low-wallet');
    await page.getByRole('button', { name: 'Top up wallet' }).click();
    await expect(vis(page, 'wallet')).toBeVisible();
    await shot(page, '16-wallet-empty');
    await vis(page, 'topup-1000000').click();
    await page.getByRole('button', { name: /^Top up ₦10,000/ }).click();
    await expect.poll(() => topUpReference, { timeout: 15_000 }).not.toBe('');
    await expect(vis(page, 'topup-pending')).toBeVisible();
    await sendChargeSuccess(topUpReference, 9001);
    await expect(vis(page, 'topup-done')).toBeVisible({ timeout: 30_000 });
    await expect(vis(page, 'wallet-balance')).toContainText('10,000.00', { timeout: 30_000 });
    await shot(page, '17-wallet-funded');
    await vis(page, 'back').click();
  });

  await test.step('C15 checkout: promo, full breakdown, pay with wallet', async () => {
    await expect(vis(page, 'checkout')).toBeVisible();
    await expect(vis(page, 'price-breakdown')).toBeVisible();
    await vis(page, 'promo-input').fill('TUNDE50');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(vis(page, 'promo-status')).toContainText('TUNDE50 applied');
    await expect(vis(page, 'price-price.discount')).toBeVisible();
    await expect(vis(page, 'price-price.total')).toBeVisible();
    await shot(page, '18-checkout-breakdown');
    await page.getByRole('button', { name: /^Pay / }).click();
  });

  await test.step('C18 order placed', async () => {
    await expect(vis(page, 'placed')).toBeVisible();
    await expect(vis(page, 'placed-ref')).toBeVisible();
    await shot(page, '19-order-placed');
    await page.getByRole('button', { name: 'Track order' }).click();
  });

  await test.step('C20/C21 tracking follows vendor actions', async () => {
    await expect(vis(page, 'track')).toBeVisible();
    await expect(vis(page, 'track-status')).toHaveText('Waiting for the vendor to accept');
    await shot(page, '20-track-placed');
    expect(orderId).not.toBe('');
    const owner = await signInViaOtp(OWNER_PHONE);
    await apiCall('POST', `/v1/vendor-orders/${orderId}/accept`, owner, { prepMinutes: 15 });
    await expect(vis(page, 'track-status')).toHaveText('Accepted by the vendor', {
      timeout: 40_000,
    });
    await shot(page, '21-track-accepted');
    await apiCall('POST', `/v1/vendor-orders/${orderId}/preparing`, owner);
    await expect(vis(page, 'track-status')).toHaveText('Your order is being prepared', {
      timeout: 40_000,
    });
    await shot(page, '22-track-preparing');
    await apiCall('POST', `/v1/vendor-orders/${orderId}/ready`, owner);
    await expect(vis(page, 'track-status')).not.toHaveText('Your order is being prepared', {
      timeout: 40_000,
    });
    await shot(page, '23-track-ready');
  });

  await test.step('C29 history + C30 order detail/receipt + reorder', async () => {
    await page.getByRole('button', { name: 'Order details' }).click();
    await expect(vis(page, 'order-detail')).toBeVisible();
    await expect(vis(page, 'price-breakdown')).toBeVisible();
    await shot(page, '24-order-detail');
    await vis(page, 'back').click();
    await vis(page, 'back').click();
    await vis(page, 'tab-orders').click();
    await expect(vis(page, `order-${orderId}`)).toBeVisible();
    await shot(page, '25-orders');
    await vis(page, `order-${orderId}`).click();
    await page.getByRole('button', { name: 'Order details' }).click();
    await page.getByRole('button', { name: 'Reorder' }).click();
    await expect(vis(page, 'cart')).toBeVisible();
    await expect(vis(page, 'cart').getByText('Party jollof rice')).toBeVisible();
    await shot(page, '26-cart-after-reorder');
  });

  await test.step('C31 profile, C32 wallet, C34 inbox, C33 addresses, sign out', async () => {
    await vis(page, 'tab-profile').click();
    await expect(vis(page, 'profile-name')).toHaveText('Amaka');
    await shot(page, '27-profile');
    await vis(page, 'profile-profile.wallet').click();
    await expect(vis(page, 'wallet-balance')).toBeVisible();
    await shot(page, '28-wallet-after-order');
    await vis(page, 'back').click();
    await vis(page, 'profile-profile.inbox').click();
    await expect(vis(page, 'inbox')).toBeVisible();
    await expect(vis(page, 'inbox-item').or(vis(page, 'inbox-empty')).first()).toBeVisible();
    await shot(page, '29-inbox');
    await vis(page, 'back').click();
    await vis(page, 'profile-profile.addresses').click();
    await expect(vis(page, 'address-row').first()).toBeVisible();
    await shot(page, '30-addresses');
    await vis(page, 'back').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await shot(page, '31-signed-out');
  });

  expect(consoleErrors).toEqual([]);
});
