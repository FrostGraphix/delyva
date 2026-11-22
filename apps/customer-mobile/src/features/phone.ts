import { NigeriaPhoneSchema } from '@delyva/contracts';

/**
 * Normalises what a Nigerian user types ("0803 123 4567", "8031234567", "+234 803…") into
 * E.164 (`+2348031234567`), or null when it is not a valid mobile number.
 */
export function toNigeriaE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let national: string;
  if (digits.startsWith('234')) national = digits.slice(3);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;
  const e164 = `+234${national}`;
  return NigeriaPhoneSchema.safeParse(e164).success ? e164 : null;
}

/** Masks a phone for display: `+234 803 *** 4567`. */
export function maskPhone(e164: string): string {
  const n = e164.replace(/^\+234/, '');
  if (n.length !== 10) return e164;
  return `+234 ${n.slice(0, 3)} *** ${n.slice(6)}`;
}
