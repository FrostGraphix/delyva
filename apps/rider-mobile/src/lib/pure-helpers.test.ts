import type { RiderApplication } from '@delyva/contracts';
import { ApiError } from '@delyva/sdk';
import { isRetryable, problemCode, problemStatus } from '../api/errors';
import { t } from '../i18n';
import { routeForApplication, stepNumber } from '../onboarding/routes';
import { mapsUrl } from '../trip/maps';
import { isFinal, nextStatus, stageFor } from '../trip/trip-stage';
import { batteryPercent } from './battery';
import { formatBps, formatDistance, formatMinutes, formatNaira, toE164Nigeria } from './format';
import { rolesFromAccessToken } from './jwt';

const app = (over: Partial<RiderApplication>): RiderApplication => ({
  id: null,
  status: 'in_progress',
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
  ...over,
});

/** Pre-encoded payloads: {"roles":["customer","rider"]} and {"roles":["root"]}. */
const RIDER_TOKEN = 'h.eyJyb2xlcyI6WyJjdXN0b21lciIsInJpZGVyIl19.s';
const ROOT_TOKEN = 'h.eyJyb2xlcyI6WyJyb290Il19.s';

describe('onboarding routes', () => {
  it('resumes at the first incomplete step', () => {
    expect(routeForApplication(app({ completedSteps: ['personal_details', 'identity'] }))).toBe(
      '/onboarding/vehicle',
    );
  });
  it('goes to review when every step is complete', () => {
    const all = [
      'personal_details',
      'identity',
      'vehicle',
      'guarantor',
      'bank_account',
      'training_quiz',
    ] as const;
    expect(routeForApplication(app({ completedSteps: [...all] }))).toBe('/onboarding/review');
  });
  it.each(['pending_review', 'approved', 'rejected'] as const)('shows status once %s', (status) => {
    expect(routeForApplication(app({ status }))).toBe('/onboarding/status');
  });
  it('numbers steps from 1', () => {
    expect(stepNumber('identity')).toBe(2);
  });
});

describe('format helpers', () => {
  it('formats kobo as naira', () => {
    expect(formatNaira(250_000)).toContain('2,500');
  });
  it('formats distance and minutes', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(2_420)).toBe('2.4 km');
    expect(formatMinutes(20)).toBe('1 min');
    expect(formatMinutes(600)).toBe('10 min');
  });
  it('formats acceptance rate', () => {
    expect(formatBps(null)).toBe('—');
    expect(formatBps(8_550)).toBe('86%');
  });
  it.each([
    ['08031234567', '+2348031234567'],
    ['+2348031234567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['8031234567', '+2348031234567'],
  ])('normalises %s', (input, out) => {
    expect(toE164Nigeria(input)).toBe(out);
  });
  it('rejects invalid numbers', () => {
    expect(toE164Nigeria('0123')).toBeNull();
  });
});

describe('jwt roles (UI routing only)', () => {
  it('reads roles from the payload', () => {
    expect(rolesFromAccessToken(RIDER_TOKEN)).toEqual(['customer', 'rider']);
  });
  it('returns no roles for malformed tokens', () => {
    expect(rolesFromAccessToken('nope')).toEqual([]);
    expect(rolesFromAccessToken('a.!!!.c')).toEqual([]);
    expect(rolesFromAccessToken(ROOT_TOKEN)).toEqual([]);
  });
});

describe('errors', () => {
  const e = (status: number): ApiError =>
    new ApiError({ type: 'x', title: 'x', status, code: 'internal_error' });
  it('classifies retryable failures', () => {
    expect(isRetryable(new TypeError('offline'))).toBe(true);
    expect(isRetryable(e(503))).toBe(true);
    expect(isRetryable(e(429))).toBe(true);
    expect(isRetryable(e(422))).toBe(false);
  });
  it('exposes code and status', () => {
    expect(problemCode(e(500))).toBe('internal_error');
    expect(problemStatus(e(500))).toBe(500);
    expect(problemCode(new Error('x'))).toBeNull();
  });
});

describe('trip stages and maps', () => {
  it('requires the pickup code at the first stage and the OTP at the customer', () => {
    expect(stageFor('assigned').code).toBe('pickup');
    expect(stageFor('at_customer').code).toBe('delivery');
    expect(stageFor('delivered').action).toBeNull();
  });
  it('advances optimistically', () => {
    expect(nextStatus('arrived-at-vendor')).toBe('at_vendor');
    expect(nextStatus('picked-up')).toBe('picked_up');
    expect(nextStatus('arrived-at-customer')).toBe('at_customer');
    expect(nextStatus('delivered')).toBe('delivered');
    expect(nextStatus('undeliverable')).toBe('undeliverable');
    expect(isFinal('delivered')).toBe(true);
    expect(isFinal('picked_up')).toBe(false);
  });
  it('builds platform maps hand-off URLs', () => {
    const p = { lat: 6.43, lng: 3.42 };
    expect(mapsUrl(p, 'ios')).toBe('http://maps.apple.com/?daddr=6.43,3.42&dirflg=d');
    expect(mapsUrl(p, 'android')).toBe('google.navigation:q=6.43,3.42&mode=l');
    expect(mapsUrl(p, 'web')).toContain('destination=6.43,3.42');
  });
});

describe('battery and i18n', () => {
  it('converts battery levels', () => {
    expect(batteryPercent(0.864)).toBe(86);
    expect(batteryPercent(-1)).toBeNull();
  });
  it('fills placeholders and leaves unknown ones', () => {
    expect(t('offer.secondsLeft', { seconds: 12 })).toBe('12 seconds left');
    expect(t('home.greeting')).toBe('Hi {name}');
  });
});
