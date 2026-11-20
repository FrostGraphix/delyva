import type { CurrencyCode, Money } from '@delyva/utils';
import type { PaymentProvider } from '../application/ports.js';
import type { VerifiedCharge } from '../domain/payment-intent.js';
import type { SettledCharge } from '../domain/reconciliation.js';

/**
 * Deterministic in-memory provider for tests and local development (never production; enforced
 * by env validation). Initialised charges verify as `success` unless overridden with {@link setOutcome}.
 */
export class FakePaymentProvider implements PaymentProvider {
  /** @inheritdoc */
  readonly name = 'fake';
  private readonly charges = new Map<
    string,
    { amount: Money; outcome: VerifiedCharge['outcome']; at: Date }
  >();
  /** Calls made, for assertions. */
  readonly calls: { op: string; reference: string; amountMinor?: number }[] = [];
  private failTransfers = false;

  /** @inheritdoc */
  initialize(input: {
    reference: string;
    amount: Money;
  }): Promise<{ authorizationUrl: string; reference: string }> {
    this.charges.set(input.reference, { amount: input.amount, outcome: 'success', at: new Date() });
    this.calls.push({
      op: 'initialize',
      reference: input.reference,
      amountMinor: input.amount.minor,
    });
    return Promise.resolve({
      authorizationUrl: `https://checkout.fake.invalid/${input.reference}`,
      reference: input.reference,
    });
  }

  /** Overrides a charge outcome (and optionally the amount the "provider" reports). */
  setOutcome(reference: string, outcome: VerifiedCharge['outcome'], amount?: Money): void {
    const c = this.charges.get(reference);
    if (c) this.charges.set(reference, { ...c, outcome, amount: amount ?? c.amount });
  }

  /** Makes subsequent transfers throw. */
  setTransfersFailing(fail: boolean): void {
    this.failTransfers = fail;
  }

  /** @inheritdoc */
  verify(reference: string): Promise<VerifiedCharge> {
    const c = this.charges.get(reference);
    if (!c) return Promise.reject(new Error('fake: unknown reference'));
    return Promise.resolve({
      reference,
      outcome: c.outcome,
      amount: c.amount,
      providerTransactionId: `fake-${reference}`,
    });
  }

  /** @inheritdoc */
  refund(input: { reference: string; amount: Money }): Promise<{ providerRefundId: string }> {
    this.calls.push({ op: 'refund', reference: input.reference, amountMinor: input.amount.minor });
    return Promise.resolve({ providerRefundId: `fake-refund-${String(this.calls.length)}` });
  }

  /** @inheritdoc */
  createTransferRecipient(input: {
    accountNumber: string;
    currency: CurrencyCode;
  }): Promise<{ recipientCode: string }> {
    return Promise.resolve({ recipientCode: `RCP_fake_${input.accountNumber}` });
  }

  /** @inheritdoc */
  transfer(input: {
    amount: Money;
    reference: string;
  }): Promise<{ transferCode: string; status: string }> {
    if (this.failTransfers) return Promise.reject(new Error('fake: transfer failed'));
    this.calls.push({
      op: 'transfer',
      reference: input.reference,
      amountMinor: input.amount.minor,
    });
    return Promise.resolve({ transferCode: `TRF_fake_${input.reference}`, status: 'pending' });
  }

  /** @inheritdoc */
  resolveBankAccount(input: {
    accountNumber: string;
  }): Promise<{ accountNumber: string; accountName: string }> {
    return Promise.resolve({
      accountNumber: input.accountNumber,
      accountName: 'FAKE ACCOUNT HOLDER',
    });
  }

  /** @inheritdoc */
  listSuccessfulCharges(input: { from: Date; to: Date }): Promise<SettledCharge[]> {
    const out: SettledCharge[] = [];
    for (const [reference, c] of this.charges) {
      if (c.outcome === 'success' && c.at >= input.from && c.at < input.to)
        out.push({ reference, amount: c.amount });
    }
    return Promise.resolve(out);
  }
}
