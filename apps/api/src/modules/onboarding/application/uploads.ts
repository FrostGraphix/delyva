import type { CreateUpload, DownloadUrl, UploadPurpose, UploadTicket } from '@delyva/contracts';
import type { StorageProvider } from '../../../shared/storage/storage.js';
import { OnboardingError } from '../domain/onboarding-errors.js';
import {
  policyViolation,
  SNIFF_BYTES,
  sniffMatches,
  UPLOAD_POLICY,
} from '../domain/upload-policy.js';
import type { Clock, ReviewActor, ReviewDeps, UploadRecord, UploadRepository } from './ports.js';

const PUT_TTL_SECONDS = 900;
const GET_TTL_SECONDS = 300;

/**
 * Private uploads behind signed, expiring URLs. Declared MIME/size are checked on create and
 * re-checked against the stored object (size + magic bytes) before a step may reference it.
 * DEBT(storage): images are not re-encoded (EXIF/polyglot stripping) — no image library in the
 * stack yet — add a sharp-based worker that re-encodes to WebP before ops review.
 */
export class UploadService {
  /** @param deps storage, repository, clock, audit */
  constructor(
    private readonly deps: {
      storage: StorageProvider;
      uploads: UploadRepository;
      clock: Clock;
      audit: ReviewDeps['audit'];
    },
  ) {}

  /** Declares an upload and returns a presigned PUT. @throws OnboardingError upload_rejected */
  async create(userId: string, input: CreateUpload): Promise<UploadTicket> {
    const violation = policyViolation(input.purpose, input.contentType, input.sizeBytes);
    if (violation) throw new OnboardingError('upload_rejected', violation);
    const id = this.deps.clock.uuid();
    const storageKey = `${input.purpose.replace(/_/g, '-')}/${id}`;
    const maxSizeBytes = UPLOAD_POLICY[input.purpose].maxBytes;
    await this.deps.uploads.create({
      id,
      ownerUserId: userId,
      purpose: input.purpose,
      contentType: input.contentType,
      maxSizeBytes,
      storageKey,
      status: 'pending',
    });
    const signed = await this.deps.storage.presignPut({
      key: storageKey,
      contentType: input.contentType,
      expiresInSeconds: PUT_TTL_SECONDS,
    });
    const expiresAt = new Date(this.deps.clock.now().getTime() + PUT_TTL_SECONDS * 1000);
    return {
      uploadId: id,
      method: 'PUT',
      url: signed.url,
      headers: signed.headers,
      expiresAt: expiresAt.toISOString(),
      maxSizeBytes,
    };
  }

  /** Upload by storage key (dev upload endpoint). */
  async byKey(storageKey: string): Promise<UploadRecord | null> {
    const id = storageKey.split('/')[1];
    const u = id ? await this.deps.uploads.find(id) : null;
    return u?.storageKey === storageKey ? u : null;
  }

  /** Validates bytes received by the dev endpoint. @throws OnboardingError upload_rejected */
  assertBytesAcceptable(u: UploadRecord, contentType: string, body: Buffer): void {
    if (contentType !== u.contentType)
      throw new OnboardingError('upload_rejected', 'Content-Type differs from the declared type.');
    if (body.length === 0 || body.length > u.maxSizeBytes)
      throw new OnboardingError('upload_rejected', 'File is empty or too large.');
    if (!sniffMatches(u.contentType, body.subarray(0, SNIFF_BYTES))) {
      throw new OnboardingError('upload_rejected', 'File content does not match its type.');
    }
  }

  /** Ensures the caller uploaded a valid file for one of `purposes`. */
  async requireUploaded(
    userId: string,
    uploadId: string,
    purposes: readonly UploadPurpose[],
  ): Promise<UploadRecord> {
    const u = await this.deps.uploads.find(uploadId);
    if (u?.ownerUserId !== userId) throw new OnboardingError('not_found', 'Upload not found.');
    if (!purposes.includes(u.purpose))
      throw new OnboardingError('validation_failed', `Upload is not a ${purposes.join('/')} file.`);
    const obj = await this.deps.storage.stat(u.storageKey);
    if (!obj) throw new OnboardingError('upload_rejected', 'The file has not been uploaded yet.');
    if (
      obj.sizeBytes > u.maxSizeBytes ||
      (obj.contentType !== null && obj.contentType !== u.contentType)
    ) {
      throw new OnboardingError('upload_rejected', 'Stored file breaks the upload policy.');
    }
    if (!sniffMatches(u.contentType, await this.deps.storage.read(u.storageKey, SNIFF_BYTES))) {
      throw new OnboardingError('upload_rejected', 'File content does not match its type.');
    }
    if (u.status !== 'verified') await this.deps.uploads.markVerified(u.id, obj.sizeBytes);
    return u;
  }

  /** Reads a verified upload's bytes. */
  async read(
    userId: string,
    uploadId: string,
    purposes: readonly UploadPurpose[],
  ): Promise<{ contentType: string; bytes: Buffer }> {
    const u = await this.requireUploaded(userId, uploadId, purposes);
    return {
      contentType: u.contentType,
      bytes: await this.deps.storage.read(u.storageKey, u.maxSizeBytes),
    };
  }

  /** Signed GET for ops review; audited. */
  async downloadUrl(actor: ReviewActor, uploadId: string): Promise<DownloadUrl> {
    const u = await this.deps.uploads.find(uploadId);
    if (!u) throw new OnboardingError('not_found', 'Upload not found.');
    await this.deps.audit.record({
      actorId: actor.userId,
      actorRoles: actor.roles,
      action: 'upload.download_url_issued',
      targetType: 'upload',
      targetId: u.id,
      reason: null,
      before: null,
      after: { purpose: u.purpose },
      ip: actor.ip,
    });
    const { url } = await this.deps.storage.presignGet({
      key: u.storageKey,
      expiresInSeconds: GET_TTL_SECONDS,
    });
    return {
      url,
      expiresAt: new Date(this.deps.clock.now().getTime() + GET_TTL_SECONDS * 1000).toISOString(),
    };
  }
}
