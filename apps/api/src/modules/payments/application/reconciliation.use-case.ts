import { PAYMENTS_EVENTS } from '@delyva/contracts';
import { type Mismatch, reconcile } from '../domain/reconciliation.js';
import type { PaymentProvider, PaymentsLogger, PaymentsStore } from './ports.js';

/** Dependencies of {@link RunReconciliation}. */
export interface ReconciliationDeps {
  readonly store: PaymentsStore;
  readonly provider: PaymentProvider;
  readonly logger: PaymentsLogger;
}

/**
 * Command: nightly reconciliation for one UTC day. Compares provider-reported successful charges
 * with intents we settled; any mismatch is logged and emitted as an outbox event for alerting.
 */
export class RunReconciliation {
  /** @param deps ports */
  constructor(private readonly deps: ReconciliationDeps) {}

  /** Executes for `date` (YYYY-MM-DD, UTC). */
  async execute(date: string): Promise<{ date: string; mismatches: Mismatch[] }> {
    const from = new Date(`${date}T00:00:00.000Z`);
    const to = new Date(from.getTime() + 86_400_000);
    const [theirs, ours] = await Promise.all([
      this.deps.provider.listSuccessfulCharges({ from, to }),
      this.deps.store.settledCharges(this.deps.provider.name, from, to),
    ]);
    const mismatches = reconcile(theirs, ours);
    if (mismatches.length > 0) {
      this.deps.logger.warn({ date, count: mismatches.length }, 'reconciliation mismatch');
      await this.deps.store.transaction((tx) =>
        tx.appendEvent({
          type: PAYMENTS_EVENTS.reconciliationMismatched,
          aggregateType: 'reconciliation',
          aggregateId: date,
          payload: { date, mismatches },
        }),
      );
    }
    return { date, mismatches };
  }
}
