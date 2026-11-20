import { describe, expect, it } from 'vitest';
import { DelyvaClient } from './client.js';

const RIDER_APP = {
  id: null,
  status: 'not_started',
  currentStep: 'personal_details',
  completedSteps: [],
  personalDetails: null,
  identity: null,
  vehicle: null,
  guarantor: null,
  bankAccount: null,
  quiz: null,
  submittedAt: null,
  reviewedAt: null,
  rejectionReason: null,
};
const VENDOR_APP = {
  id: null,
  status: 'not_started',
  vendorId: null,
  currentStep: 'business_details',
  completedSteps: [],
  businessDetails: null,
  documents: null,
  location: null,
  menu: null,
  bankAccount: null,
  testOrderCompleted: false,
  submittedAt: null,
  reviewedAt: null,
  rejectionReason: null,
};
const ID = '0b6c1d1e-8a43-4bd3-9b55-4f3b5f0f6a11';
const NOW = '2026-11-20T10:00:00.000Z';

function setup(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }));
  };
  const client = new DelyvaClient({
    baseUrl: 'https://api.test',
    fetch: fetchImpl as typeof fetch,
    idempotencyKey: () => 'idem-key-1234',
    accessToken: () => 'tok',
    adminTwoFactorToken: () => 'twofa',
  });
  const headers = (i = 0) => (calls[i]?.init.headers ?? {}) as Record<string, string>;
  return { client, calls, headers };
}

describe('onboarding SDK', () => {
  it('rider application calls hit the contract paths', async () => {
    const s = setup(RIDER_APP);
    await s.client.getMyRiderApplication();
    await s.client.saveRiderStep('bank_account', { bankCode: '058', accountNumber: '0123456789' });
    await s.client.submitRiderApplication();
    expect(s.calls.map((c) => `${String(c.init.method)} ${c.url}`)).toEqual([
      'GET https://api.test/v1/rider-applications/me',
      'PUT https://api.test/v1/rider-applications/me/bank-account',
      'POST https://api.test/v1/rider-applications/me/submit',
    ]);
    expect(s.headers(2)['Idempotency-Key']).toBe('idem-key-1234');
  });

  it('quiz, step views and uploads', async () => {
    const quiz = setup({ passMarkPercent: 80, questions: [] });
    await expect(quiz.client.getRiderQuiz()).resolves.toMatchObject({ passMarkPercent: 80 });
    const result = setup({ correct: 1, total: 1, scorePercent: 100, passed: true, attempts: 1 });
    await expect(
      result.client.submitRiderQuiz({ answers: [{ questionId: 'q1', optionId: 'a' }] }),
    ).resolves.toMatchObject({ passed: true });
    const views = setup(null, 204);
    await views.client.recordRiderStepView('identity');
    await views.client.recordVendorStepView('menu');
    expect(views.calls[1]?.url).toBe('https://api.test/v1/vendor-applications/me/step-views');
    const up = setup({
      uploadId: ID,
      method: 'PUT',
      url: 'u',
      headers: {},
      expiresAt: NOW,
      maxSizeBytes: 5,
    });
    await expect(
      up.client.createUpload({ purpose: 'selfie', contentType: 'image/jpeg', sizeBytes: 5 }),
    ).resolves.toMatchObject({ uploadId: ID });
  });

  it('vendor calls', async () => {
    const s = setup(VENDOR_APP);
    await s.client.getMyVendorApplication();
    await s.client.saveVendorStep('menu_photos', { uploadIds: [ID] });
    await s.client.submitVendorApplication();
    expect(s.calls[1]?.url).toBe('https://api.test/v1/vendor-applications/me/menu-photos');
    const imp = setup({ draftMenuId: ID, categories: 1, items: 2 });
    await expect(imp.client.importVendorMenu({ csvUploadId: ID })).resolves.toMatchObject({
      items: 2,
    });
  });

  it('admin calls send the x-admin-2fa header', async () => {
    const list = setup({ items: [] });
    await list.client.listRiderApplications();
    await list.client.listVendorApplications('approved');
    await list.client.listFeatureFlags();
    expect(list.calls[1]?.url).toBe(
      'https://api.test/v1/admin/vendor-applications?status=approved',
    );
    expect(list.headers(0)['x-admin-2fa']).toBe('twofa');
    const rider = setup(RIDER_APP);
    await rider.client.decideRiderApplication(ID, 'approve', { reason: 'looks good' });
    await rider.client.decideRiderApplication(ID, 'reject', { reason: 'blurry id' });
    expect(rider.calls[1]?.url).toBe(`https://api.test/v1/admin/rider-applications/${ID}/reject`);
    const vendor = setup(VENDOR_APP);
    await vendor.client.decideVendorApplication(ID, 'approve', { reason: 'looks good' });
    await vendor.client.decideVendorApplication(ID, 'reject', { reason: 'blurry id' });
    const dl = setup({ url: 'x', expiresAt: NOW });
    await expect(dl.client.getUploadDownloadUrl(ID)).resolves.toMatchObject({ url: 'x' });
    const flag = setup({
      key: 'a.b',
      enabled: true,
      description: '',
      updatedBy: null,
      updatedAt: NOW,
    });
    await expect(
      flag.client.upsertFeatureFlag({ key: 'a.b', enabled: true, reason: 'because' }),
    ).resolves.toMatchObject({ enabled: true });
  });

  it('2FA enrolment and verification', async () => {
    const e = setup({ secret: 'ABC', otpauthUri: 'otpauth://x', digits: 6, periodSeconds: 30 });
    await expect(e.client.startAdminTotpEnrolment()).resolves.toMatchObject({ digits: 6 });
    const v = setup({ token: 't', expiresInSeconds: 60 });
    await v.client.confirmAdminTotpEnrolment({ code: '123456' });
    await expect(v.client.verifyAdminTotp({ code: '123456' })).resolves.toEqual({
      token: 't',
      expiresInSeconds: 60,
    });
    const none = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: () => Promise.resolve(new Response(JSON.stringify({ items: [] }))),
    });
    await expect(none.listFeatureFlags()).resolves.toEqual({ items: [] });
  });
});
