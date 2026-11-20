import type { RiderStep, UploadPurpose, VendorStep } from '@delyva/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import { appendToOutbox } from '../../../shared/outbox/outbox.writer.js';
import type {
  ApplicationRepository,
  InTx,
  PendingEvent,
  RiderRecord,
  UploadRecord,
  UploadRepository,
  VendorRecord,
} from '../application/ports.js';
import type { StoredStatus } from '../domain/application-steps.js';
import { riderApplications, uploads, vendorApplications } from './onboarding.schema.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function appendAll(
  tx: Tx,
  aggregateType: string,
  aggregateId: string,
  events: readonly PendingEvent[],
): Promise<void> {
  for (const e of events) {
    await appendToOutbox(tx, { type: e.type, aggregateType, aggregateId, payload: e.payload });
  }
}

const review = (r: {
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
}) => ({
  submittedAt: r.submittedAt,
  reviewedAt: r.reviewedAt,
  reviewedBy: r.reviewedBy,
  rejectionReason: r.rejectionReason,
});

// ------------------------------------------------------------------ rider

type RiderRow = typeof riderApplications.$inferSelect;
interface RiderData {
  personal: RiderRecord['personal'];
  identity: Omit<NonNullable<RiderRecord['identity']>, 'ninCiphertext'> | null;
  vehicle: RiderRecord['vehicle'];
  guarantor: Omit<NonNullable<RiderRecord['guarantor']>, 'phoneCiphertext'> | null;
  bank: Omit<NonNullable<RiderRecord['bank']>, 'accountNumberCiphertext'> | null;
  quiz: RiderRecord['quiz'];
}

function riderFromRow(row: RiderRow): RiderRecord {
  const d = row.data as RiderData;
  return {
    id: row.id,
    userId: row.userId,
    status: row.status as StoredStatus,
    version: row.version,
    completedSteps: row.completedSteps as RiderStep[],
    personal: d.personal,
    vehicle: d.vehicle,
    quiz: d.quiz,
    identity:
      d.identity && row.ninCiphertext ? { ...d.identity, ninCiphertext: row.ninCiphertext } : null,
    guarantor:
      d.guarantor && row.guarantorPhoneCiphertext
        ? { ...d.guarantor, phoneCiphertext: row.guarantorPhoneCiphertext }
        : null,
    bank:
      d.bank && row.bankAccountCiphertext
        ? { ...d.bank, accountNumberCiphertext: row.bankAccountCiphertext }
        : null,
    ...review(row),
  };
}

function riderToRow(r: RiderRecord) {
  const { ninCiphertext = null, ...identity } = r.identity ?? {};
  const { phoneCiphertext = null, ...guarantor } = r.guarantor ?? {};
  const { accountNumberCiphertext = null, ...bank } = r.bank ?? {};
  const data: RiderData = {
    personal: r.personal,
    vehicle: r.vehicle,
    quiz: r.quiz,
    identity: r.identity ? (identity as RiderData['identity']) : null,
    guarantor: r.guarantor ? (guarantor as RiderData['guarantor']) : null,
    bank: r.bank ? (bank as RiderData['bank']) : null,
  };
  return {
    status: r.status,
    completedSteps: [...r.completedSteps],
    data,
    ninCiphertext,
    guarantorPhoneCiphertext: phoneCiphertext,
    bankAccountCiphertext: accountNumberCiphertext,
    ...review(r),
  };
}

/** Drizzle rider application storage (optimistic concurrency on `version`). */
export class DrizzleRiderApplicationRepository implements ApplicationRepository<RiderRecord> {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async findByUser(userId: string): Promise<RiderRecord | null> {
    const [row] = await this.db
      .select()
      .from(riderApplications)
      .where(eq(riderApplications.userId, userId));
    return row ? riderFromRow(row) : null;
  }

  /** @inheritdoc */
  async findById(id: string): Promise<RiderRecord | null> {
    const [row] = await this.db
      .select()
      .from(riderApplications)
      .where(eq(riderApplications.id, id));
    return row ? riderFromRow(row) : null;
  }

  /** @inheritdoc */
  async create(r: RiderRecord): Promise<RiderRecord> {
    await this.db
      .insert(riderApplications)
      .values({ id: r.id, userId: r.userId, ...riderToRow(r) })
      .onConflictDoNothing({ target: riderApplications.userId });
    const found = await this.findByUser(r.userId);
    if (!found) throw new Error('rider application insert lost');
    return found;
  }

  /** @inheritdoc */
  async save(r: RiderRecord, events: readonly PendingEvent[], inTx?: InTx): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(riderApplications)
        .set({ ...riderToRow(r), version: r.version + 1, updatedAt: sql`now()` })
        .where(and(eq(riderApplications.id, r.id), eq(riderApplications.version, r.version)))
        .returning({ id: riderApplications.id });
      if (rows.length === 0) return false;
      await appendAll(tx, 'rider_application', r.id, events);
      if (inTx) await inTx(tx);
      return true;
    });
  }

  /** @inheritdoc */
  async appendEvents(events: readonly PendingEvent[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const e of events)
        await appendAll(tx, 'rider_application', String(e.payload.applicationId), [e]);
    });
  }

  /** @inheritdoc */
  async listByStatus(status: StoredStatus): Promise<RiderRecord[]> {
    const rows = await this.db
      .select()
      .from(riderApplications)
      .where(eq(riderApplications.status, status))
      .orderBy(asc(riderApplications.submittedAt), asc(riderApplications.createdAt))
      .limit(100);
    return rows.map(riderFromRow);
  }
}

// ------------------------------------------------------------------ vendor

type VendorRow = typeof vendorApplications.$inferSelect;
interface VendorData {
  business: VendorRecord['business'];
  documents: Omit<NonNullable<VendorRecord['documents']>, 'ownerIdCiphertext'> | null;
  location: VendorRecord['location'];
  menu: VendorRecord['menu'];
  bank: Omit<NonNullable<VendorRecord['bank']>, 'accountNumberCiphertext'> | null;
  testOrder: VendorRecord['testOrder'];
}

function vendorFromRow(row: VendorRow): VendorRecord {
  const d = row.data as VendorData;
  return {
    id: row.id,
    userId: row.userId,
    vendorId: row.vendorId,
    branchId: row.branchId,
    draftMenuId: row.draftMenuId,
    status: row.status as StoredStatus,
    version: row.version,
    completedSteps: row.completedSteps as VendorStep[],
    business: d.business,
    location: d.location,
    menu: d.menu,
    testOrder: d.testOrder,
    documents:
      d.documents && row.ownerIdCiphertext
        ? { ...d.documents, ownerIdCiphertext: row.ownerIdCiphertext }
        : null,
    bank:
      d.bank && row.bankAccountCiphertext
        ? { ...d.bank, accountNumberCiphertext: row.bankAccountCiphertext }
        : null,
    ...review(row),
  };
}

function vendorToRow(r: VendorRecord) {
  const { ownerIdCiphertext = null, ...documents } = r.documents ?? {};
  const { accountNumberCiphertext = null, ...bank } = r.bank ?? {};
  const data: VendorData = {
    business: r.business,
    location: r.location,
    menu: r.menu,
    testOrder: r.testOrder,
    documents: r.documents ? (documents as VendorData['documents']) : null,
    bank: r.bank ? (bank as VendorData['bank']) : null,
  };
  return {
    vendorId: r.vendorId,
    branchId: r.branchId,
    draftMenuId: r.draftMenuId,
    status: r.status,
    completedSteps: [...r.completedSteps],
    data,
    ownerIdCiphertext,
    bankAccountCiphertext: accountNumberCiphertext,
    ...review(r),
  };
}

/** Drizzle vendor application storage. */
export class DrizzleVendorApplicationRepository implements ApplicationRepository<VendorRecord> {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async findByUser(userId: string): Promise<VendorRecord | null> {
    const [row] = await this.db
      .select()
      .from(vendorApplications)
      .where(eq(vendorApplications.userId, userId));
    return row ? vendorFromRow(row) : null;
  }

  /** @inheritdoc */
  async findById(id: string): Promise<VendorRecord | null> {
    const [row] = await this.db
      .select()
      .from(vendorApplications)
      .where(eq(vendorApplications.id, id));
    return row ? vendorFromRow(row) : null;
  }

  /** @inheritdoc */
  async create(r: VendorRecord): Promise<VendorRecord> {
    await this.db
      .insert(vendorApplications)
      .values({ id: r.id, userId: r.userId, ...vendorToRow(r) })
      .onConflictDoNothing({ target: vendorApplications.userId });
    const found = await this.findByUser(r.userId);
    if (!found) throw new Error('vendor application insert lost');
    return found;
  }

  /** @inheritdoc */
  async save(r: VendorRecord, events: readonly PendingEvent[], inTx?: InTx): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(vendorApplications)
        .set({ ...vendorToRow(r), version: r.version + 1, updatedAt: sql`now()` })
        .where(and(eq(vendorApplications.id, r.id), eq(vendorApplications.version, r.version)))
        .returning({ id: vendorApplications.id });
      if (rows.length === 0) return false;
      await appendAll(tx, 'vendor_application', r.id, events);
      if (inTx) await inTx(tx);
      return true;
    });
  }

  /** @inheritdoc */
  async appendEvents(events: readonly PendingEvent[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const e of events)
        await appendAll(tx, 'vendor_application', String(e.payload.applicationId), [e]);
    });
  }

  /** @inheritdoc */
  async listByStatus(status: StoredStatus): Promise<VendorRecord[]> {
    const rows = await this.db
      .select()
      .from(vendorApplications)
      .where(eq(vendorApplications.status, status))
      .orderBy(asc(vendorApplications.submittedAt), asc(vendorApplications.createdAt))
      .limit(100);
    return rows.map(vendorFromRow);
  }
}

// ------------------------------------------------------------------ uploads

/** Drizzle upload storage. */
export class DrizzleUploadRepository implements UploadRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async create(u: UploadRecord): Promise<void> {
    await this.db.insert(uploads).values({ ...u });
  }

  /** @inheritdoc */
  async find(id: string): Promise<UploadRecord | null> {
    const [row] = await this.db.select().from(uploads).where(eq(uploads.id, id));
    return row
      ? {
          id: row.id,
          ownerUserId: row.ownerUserId,
          purpose: row.purpose as UploadPurpose,
          contentType: row.contentType,
          maxSizeBytes: row.maxSizeBytes,
          storageKey: row.storageKey,
          status: row.status as UploadRecord['status'],
        }
      : null;
  }

  /** @inheritdoc */
  async markVerified(id: string, sizeBytes: number): Promise<void> {
    await this.db
      .update(uploads)
      .set({ status: 'verified', sizeBytes, verifiedAt: sql`now()` })
      .where(eq(uploads.id, id));
  }
}
