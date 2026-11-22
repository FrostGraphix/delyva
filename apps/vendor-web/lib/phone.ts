import { NigeriaPhoneSchema } from '@delyva/contracts';

/**
 * Normalises what people type ("0803 123 4567", "2348031234567", "+234 803…") to E.164, or null
 * when it is not a valid Nigerian mobile number.
 */
export function normaliseNigerianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let e164 = digits;
  if (/^0\d{10}$/.test(digits)) e164 = `+234${digits.slice(1)}`;
  else if (/^234\d{10}$/.test(digits)) e164 = `+${digits}`;
  return NigeriaPhoneSchema.safeParse(e164).success ? e164 : null;
}
