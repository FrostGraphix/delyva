import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROUTES,
  ListApplicationsQuerySchema,
  UpsertFeatureFlagSchema,
} from '../admin/index.js';
import { buildOpenApiDocument } from '../openapi.js';
import {
  BankAccountInputSchema,
  ONBOARDING_ROUTES,
  RiderVehicleSchema,
  TestOrderChecklistSchema,
  VendorDocumentsSchema,
} from './index.js';

const UUID = '0b6c1d1e-8a43-4bd3-9b55-4f3b5f0f6a11';
const full = {
  vehicleType: 'motorcycle',
  plateNumber: 'LND123AB',
  licenceNumber: 'LAG12345',
  licenceExpiry: '2029-01-01',
  licenceUploadId: UUID,
  vehiclePhotoUploadId: UUID,
};

describe('onboarding contracts', () => {
  it('bicycles need only a photo; motorised vehicles need every licence field', () => {
    expect(
      RiderVehicleSchema.safeParse({ vehicleType: 'bicycle', vehiclePhotoUploadId: UUID }).success,
    ).toBe(true);
    expect(RiderVehicleSchema.safeParse(full).success).toBe(true);
    for (const key of ['plateNumber', 'licenceNumber', 'licenceExpiry', 'licenceUploadId']) {
      const rest = Object.fromEntries(Object.entries(full).filter(([k]) => k !== key));
      expect(RiderVehicleSchema.safeParse(rest).success).toBe(false);
    }
  });

  it('validates NUBAN, CAC numbers and the full test-order checklist', () => {
    expect(
      BankAccountInputSchema.safeParse({ bankCode: '058', accountNumber: '123' }).success,
    ).toBe(false);
    expect(
      VendorDocumentsSchema.safeParse({
        cacNumber: 'RC123456',
        cacCertificateUploadId: UUID,
        ownerIdType: 'nin',
        ownerIdNumber: 'AB123456',
        ownerIdUploadId: UUID,
      }).success,
    ).toBe(true);
    expect(TestOrderChecklistSchema.safeParse({ acceptedTestOrder: true }).success).toBe(false);
  });

  it('admin queries default to pending_review and flags need a reason', () => {
    expect(ListApplicationsQuerySchema.parse({})).toEqual({ status: 'pending_review' });
    expect(ListApplicationsQuerySchema.safeParse({ status: 'not_started' }).success).toBe(false);
    expect(
      UpsertFeatureFlagSchema.safeParse({ key: 'a.b', enabled: true, reason: 'x' }).success,
    ).toBe(false);
  });

  it('registers every onboarding and admin route in the OpenAPI document', () => {
    const doc = buildOpenApiDocument('test') as { paths: Record<string, Record<string, unknown>> };
    for (const r of [...Object.values(ONBOARDING_ROUTES), ...Object.values(ADMIN_ROUTES)]) {
      expect(doc.paths[r.path]?.[r.method]).toBeDefined();
    }
  });
});
