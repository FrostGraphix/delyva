import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 decode (no padding required). */
export function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 30-second TOTP step of a timestamp. */
export const totpStep = (ms: number): number => Math.floor(ms / 30_000);

/** RFC 4226 HOTP, 6 digits. */
export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = (h[h.length - 1] ?? 0) & 0x0f;
  const bin = h.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Waits until the TOTP step is strictly greater than `after` and returns the new code. */
export async function nextTotp(secret: Buffer, after: number): Promise<string> {
  while (totpStep(Date.now()) <= after) await new Promise((r) => setTimeout(r, 500));
  return hotp(secret, totpStep(Date.now()));
}
