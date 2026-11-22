import {
  type UploadContentType,
  UploadContentTypeSchema,
  UploadPurposeSchema,
  UploadTicketSchema,
} from '@delyva/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { csrfGuard, problem } from '../../../lib/server/bff';
import { serverConfig } from '../../../lib/server/config';
import { COOKIE } from '../../../lib/server/cookies';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/uploads (multipart: `purpose`, `file`) — declares the file at the API, then PUTs the
 * bytes to the signed, expiring URL server-side, so the browser never needs the signed URL or a
 * token. The API re-checks MIME, size and re-encodes images.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = csrfGuard(req, true);
  if (blocked) return blocked;
  const access = req.cookies.get(COOKIE.access)?.value;
  if (!access) return problem(401, 'unauthorized', 'Please sign in again.');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const purpose = UploadPurposeSchema.safeParse(form?.get('purpose'));
  const type = UploadContentTypeSchema.safeParse(file instanceof File ? declaredType(file) : null);
  if (!(file instanceof File) || !purpose.success || !type.success) {
    return problem(400, 'validation_failed', 'Choose a PDF, JPG, PNG, WebP or CSV file.');
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return problem(400, 'upload_rejected', 'Files must be between 1 byte and 10 MB.');
  }
  const ticket = await declare(access, purpose.data, type.data, file.size, req);
  if (ticket instanceof NextResponse) return ticket;
  const put = await fetch(ticket.url, {
    method: 'PUT',
    headers: ticket.headers,
    body: await file.arrayBuffer(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!put.ok) return problem(400, 'upload_rejected', 'The file could not be stored. Try again.');
  return NextResponse.json({ uploadId: ticket.uploadId }, { status: 201 });
}

async function declare(
  access: string,
  purpose: string,
  contentType: UploadContentType,
  sizeBytes: number,
  req: NextRequest,
): Promise<NextResponse | { uploadId: string; url: string; headers: Record<string, string> }> {
  const res = await fetch(`${serverConfig().apiUrl}/v1/uploads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${access}`,
      'idempotency-key': req.headers.get('idempotency-key') ?? crypto.randomUUID(),
    },
    body: JSON.stringify({ purpose, contentType, sizeBytes }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return new NextResponse(await res.arrayBuffer(), {
      status: res.status,
      headers: { 'content-type': 'application/problem+json' },
    });
  }
  return UploadTicketSchema.parse(await res.json());
}

/** Windows browsers report CSV files as an Excel MIME type; trust the extension for CSV only. */
function declaredType(file: File): string {
  return file.name.toLowerCase().endsWith('.csv') ? 'text/csv' : file.type;
}
