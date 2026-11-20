const NOISE = new Set([
  'LTD',
  'LIMITED',
  'NIG',
  'NIGERIA',
  'ENTERPRISE',
  'ENTERPRISES',
  'VENTURES',
  'GLOBAL',
  'SERVICES',
  'AND',
  'THE',
  'CO',
  'COMPANY',
]);

/** Upper-case name tokens with punctuation removed. */
export function nameTokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t !== '');
}

/**
 * Whether a resolved account name belongs to the applicant: both first and last name appear
 * among the account-name tokens, in any order (banks often print SURNAME FIRSTNAME MIDDLE).
 */
export function personNameMatches(
  person: { firstName: string; lastName: string },
  accountName: string,
): boolean {
  const account = new Set(nameTokens(accountName));
  const first = nameTokens(person.firstName);
  const last = nameTokens(person.lastName);
  return (
    first.length > 0 &&
    last.length > 0 &&
    first.every((t) => account.has(t)) &&
    last.every((t) => account.has(t))
  );
}

/** Whether a business account name shares a significant token (≥ 3 letters, not boilerplate). */
export function businessNameMatches(businessName: string, accountName: string): boolean {
  const significant = (n: string) => nameTokens(n).filter((t) => t.length >= 3 && !NOISE.has(t));
  const account = new Set(significant(accountName));
  return significant(businessName).some((t) => account.has(t));
}

/** Last four characters for masked display. */
export function last4(value: string): string {
  return value.slice(-4);
}
