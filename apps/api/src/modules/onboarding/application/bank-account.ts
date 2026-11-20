import type { BankAccountInput } from '@delyva/contracts';
import { last4 } from '../domain/bank-name.js';
import { OnboardingError } from '../domain/onboarding-errors.js';
import type { BankResolver, OnboardingDeps, StoredBank } from './ports.js';

/**
 * Resolves the account through the payment provider and checks the holder name.
 * Mismatch → `bank_account_name_mismatch` unless the applicant re-sends with
 * `confirmNameMismatch: true`, in which case it is saved with `nameMatch=false` for ops review.
 * Provider failures (unknown account) surface as validation errors, never as 5xx.
 */
export async function resolveBank(
  input: BankAccountInput,
  resolver: BankResolver,
  cipher: OnboardingDeps['cipher'],
  context: string,
  matches: (accountName: string) => boolean,
): Promise<StoredBank> {
  let accountName: string;
  try {
    ({ accountName } = await resolver.resolveBankAccount({
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
    }));
  } catch {
    throw new OnboardingError(
      'validation_failed',
      'We could not verify that bank account. Check the bank and number.',
    );
  }
  const nameMatch = matches(accountName);
  if (!nameMatch && input.confirmNameMismatch !== true) {
    throw new OnboardingError(
      'bank_account_name_mismatch',
      'The account name does not match your details. Use your own account, or confirm to send it for manual review.',
    );
  }
  return {
    bankCode: input.bankCode,
    accountNumberCiphertext: cipher.encrypt(input.accountNumber, context),
    last4: last4(input.accountNumber),
    accountName,
    nameMatch,
  };
}

/** Masked view. */
export function bankView(
  b: StoredBank | null,
): {
  bankCode: string;
  accountNumberLast4: string;
  accountName: string;
  nameMatch: boolean;
} | null {
  return b
    ? {
        bankCode: b.bankCode,
        accountNumberLast4: b.last4,
        accountName: b.accountName,
        nameMatch: b.nameMatch,
      }
    : null;
}
