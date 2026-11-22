/** Keeps digits only and caps the length (OTP / pickup code / delivery OTP entry). */
export function sanitizeCode(raw: string, length: number): string {
  return raw.replace(/\D/g, '').slice(0, Math.max(0, length));
}
