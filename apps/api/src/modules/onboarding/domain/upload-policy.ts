import type { UploadContentType, UploadPurpose } from '@delyva/contracts';

const IMAGES: readonly UploadContentType[] = ['image/jpeg', 'image/png', 'image/webp'];
const MB = 1024 * 1024;

/** Allowed MIME types and size per purpose. */
export const UPLOAD_POLICY: Readonly<
  Record<UploadPurpose, { types: readonly UploadContentType[]; maxBytes: number }>
> = {
  selfie: { types: IMAGES, maxBytes: 5 * MB },
  drivers_licence: { types: [...IMAGES, 'application/pdf'], maxBytes: 10 * MB },
  vehicle_photo: { types: IMAGES, maxBytes: 10 * MB },
  cac_certificate: { types: [...IMAGES, 'application/pdf'], maxBytes: 10 * MB },
  owner_id: { types: [...IMAGES, 'application/pdf'], maxBytes: 10 * MB },
  menu_csv: { types: ['text/csv'], maxBytes: 1 * MB },
  menu_photo: { types: IMAGES, maxBytes: 10 * MB },
};

/** Why a declared upload breaks policy, or null when it is acceptable. */
export function policyViolation(
  purpose: UploadPurpose,
  contentType: string,
  sizeBytes: number,
): string | null {
  const p = UPLOAD_POLICY[purpose];
  if (!(p.types as readonly string[]).includes(contentType))
    return `${contentType} is not allowed for ${purpose}`;
  if (sizeBytes > p.maxBytes) return `file exceeds ${String(p.maxBytes)} bytes`;
  return null;
}

/** Number of leading bytes {@link sniffMatches} needs. */
export const SNIFF_BYTES = 64;

/** Checks magic bytes against the declared type (clients cannot lie about MIME). */
export function sniffMatches(contentType: string, head: Buffer): boolean {
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b);
  switch (contentType) {
    case 'image/jpeg':
      return starts([0xff, 0xd8, 0xff]);
    case 'image/png':
      return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return (
        head.subarray(0, 4).toString('latin1') === 'RIFF' &&
        head.subarray(8, 12).toString('latin1') === 'WEBP'
      );
    case 'application/pdf':
      return head.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'text/csv':
      return head.length > 0 && !head.includes(0);
    default:
      return false;
  }
}
