import { PAYMENTS_EVENTS } from '@delyva/contracts';
import { Money } from '@delyva/utils';
import { reverseJournal } from '../domain/ledger.js';
import { buildPayoutJournal, planPayouts, type PlannedPayout } from '../domain/payout.js';
import type { Clock, PaymentProvider, PaymentsLogger, PaymentsStore, PaymentsTx } from './ports.js';

/** Result of one payout batch run. */
export interface PayoutBatchReport {
  readonly batchId: string;
  readonly sent: number;
  readonly skipped: number;
  readonly failed: number;
  readonly alreadyDone: number;
}

/** Dependencies of {@link RunPayoutBatch}. */
export interface PayoutDeps {
  readonly store: PaymentsStore;
  readonly provider: PaymentProvider;
  readonly clock: Clock;
  readonly logger: PaymentsLogger;
  /** Smallest balance worth paying out (from env, never hardcoded). */
  readonly minimum: Money;
}

/**
 * Command: weekly vendor payout batch. Idempotent per (batch, payee): the payout row and the
 * provider transfer share a deterministic reference, so a re-run never double-pays.
 */
export class RunPayoutBatch {
  /** @param deps ports */
  constructor(private readonly deps: PayoutDeps) {}

  /** Executes the batch. */
  async execute(batchId: string): Promise<PayoutBatchReport> {
    const balances = await this.deps.store.payableBalances('vendor_payable', 'NGN');
    const plan = planPayouts(batchId, balances, this.deps.minimum);
    const report = { batchId, sent: 0, skipped: 0, failed: 0, alreadyDone: 0 };
    for (const p of plan) report[await this.payOne(batchId, p)] += 1;
    this.deps.logger.info(report, 'payout batch finished');
    return report;
  }

  private async payOne(
    batchId: string,
    p: PlannedPayout,
  ): Promise<'sent' | 'skipped' | 'failed' | 'alreadyDone'> {
    const { store, provider, clock } = this.deps;
    const row = await store.transaction((tx) =>
      tx.upsertPayout({
        id: clock.uuid(),
        batchId,
        account: p.account,
        amount: p.amount,
        reference: p.reference,
        status: 'pending',
      }),
    );
    if (row.status !== 'pending') return 'alreadyDone';
    const recipient = await store.recipientFor(p.account);
    if (!recipient) {
      await store.transaction((tx) => tx.updatePayout(row.id, 'skipped', null, 'no_recipient'));
      return 'skipped';
    }
    try {
      const t = await provider.transfer({
        amount: row.amount,
        recipientCode: recipient,
        reference: row.reference,
        reason: `Delyva payout ${batchId}`,
      });
      await store.transaction(async (tx) => {
        await tx.post(buildPayoutJournal(row.id, { ...p, amount: row.amount }, provider.name));
        await tx.updatePayout(row.id, 'sent', t.transferCode, null);
        await tx.appendEvent({
          type: PAYMENTS_EVENTS.payoutSent,
          aggregateType: 'payout',
          aggregateId: row.id,
          payload: {
            payoutId: row.id,
            batchId,
            payeeAccount: p.account,
            amount: row.amount.toJSON(),
          },
        });
      });
      return 'sent';
    } catch (err) {
      this.deps.logger.error({ err, payoutId: row.id }, 'payout transfer failed');
      await store.transaction((tx) => tx.updatePayout(row.id, 'failed', null, 'transfer_error'));
      return 'failed';
    }
  }
}

/** Applies provider transfer outcomes (webhooks) to payouts. */
export class PayoutTransitions {
  /** Handles `transfer.success` / `transfer.failed` / `transfer.reversed` inside a webhook tx. */
  async onTransferEvent(tx: PaymentsTx, reference: string, type: string): Promise<void> {
    const payout = await tx.lockPayoutByReference(reference);
    if (payout?.status !== 'sent') return;
    if (type === 'transfer.success') {
      await tx.updatePayout(payout.id, 'completed', null, null);
      return;
    }
    if (type === 'transfer.failed' || type === 'transfer.reversed') {
      const original = await tx.journalLines(`payout:${payout.id}`);
      if (original) await tx.post(reverseJournal(original, `payout:${payout.id}:reversal`));
      await tx.updatePayout(payout.id, 'failed', null, type);
    }
  }
}
