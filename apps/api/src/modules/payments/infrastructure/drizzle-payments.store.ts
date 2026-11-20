import { randomUUID } from 'node:crypto';
import type { WalletTransaction } from '@delyva/contracts';
import { type CurrencyCode, Money } from '@delyva/utils';
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import { appendToOutbox } from '../../../shared/outbox/outbox.writer.js';
import type {
  PaymentsEvent,
  PaymentsStore,
  PaymentsTx,
  PayoutRow,
  PostedLine,
  WalletHold,
} from '../application/ports.js';
import {
  creditBalance,
  type Journal,
  type JournalLine,
  parseAccountCode,
} from '../domain/ledger.js';
import type { PaymentIntentState } from '../domain/payment-intent.js';
import type { SettledCharge } from '../domain/reconciliation.js';
import { type WalletView, walletView } from '../domain/wallet.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Pick<Db, 'execute' | 'insert'>;
type Row = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  if (!Number.isSafeInteger(n)) throw new Error('ledger amount out of safe integer range');
  return n;
};
const str = (v: unknown): string => String(v);
const cur = (v: unknown): CurrencyCode => String(v) as CurrencyCode;

async function rows(db: Pick<Db, 'execute'>, q: SQL): Promise<Row[]> {
  const res = await db.execute(q);
  return res.rows;
}

function toIntent(r: Row): PaymentIntentState {
  return {
    id: str(r.id),
    userId: str(r.user_id),
    purpose: str(r.purpose) as PaymentIntentState['purpose'],
    orderId: r.order_id === null ? null : str(r.order_id),
    amount: Money.ofMinor(num(r.amount_minor), cur(r.currency)),
    method: str(r.method) as PaymentIntentState['method'],
    status: str(r.status) as PaymentIntentState['status'],
    provider: str(r.provider),
    reference: str(r.reference),
    authorizationUrl: r.authorization_url === null ? null : str(r.authorization_url),
    failureReason: r.failure_reason === null ? null : str(r.failure_reason),
    createdAt: new Date(str(r.created_at)),
  };
}

function toHold(r: Row): WalletHold {
  return {
    id: str(r.id),
    userId: str(r.user_id),
    reference: str(r.reference),
    amount: Money.ofMinor(num(r.amount_minor), cur(r.currency)),
    status: str(r.status) as WalletHold['status'],
    expiresAt: new Date(str(r.expires_at)),
  };
}

function toPayout(r: Row): PayoutRow {
  return {
    id: str(r.id),
    batchId: str(r.batch_id),
    account: str(r.account),
    amount: Money.ofMinor(num(r.amount_minor), cur(r.currency)),
    reference: str(r.reference),
    status: str(r.status) as PayoutRow['status'],
  };
}

async function readWalletView(
  db: Pick<Db, 'execute'>,
  userId: string,
  currency: CurrencyCode,
  now: Date,
): Promise<WalletView> {
  const [r] = await rows(
    db,
    sql`SELECT
      (SELECT COALESCE(sum(e.amount_minor), 0) FROM ledger_entries e
         JOIN ledger_accounts a ON a.id = e.account_id
        WHERE a.code = ${`customer_wallet:${userId}`} AND a.currency = ${currency}) AS raw,
      (SELECT COALESCE(sum(h.amount_minor), 0) FROM wallet_holds h
        WHERE h.user_id = ${userId} AND h.currency = ${currency} AND h.status = 'active'
          AND h.expires_at > ${now.toISOString()}) AS held`,
  );
  return walletView(creditBalance(num(r?.raw), currency), Money.ofMinor(num(r?.held), currency));
}

/** Drizzle/Postgres implementation of the transaction-scoped payments operations. */
class DrizzlePaymentsTx implements PaymentsTx {
  /** @param tx drizzle transaction */
  constructor(private readonly tx: Tx) {}

  async lockWallet(userId: string): Promise<void> {
    await this.lockKey(`wallet:${userId}`);
  }

  async lockKey(key: string): Promise<void> {
    await this.tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  async lockIntent(id: string): Promise<PaymentIntentState | null> {
    const [r] = await rows(this.tx, sql`SELECT * FROM payment_intents WHERE id = ${id} FOR UPDATE`);
    return r ? toIntent(r) : null;
  }

  async lockIntentByReference(reference: string): Promise<PaymentIntentState | null> {
    const [r] = await rows(
      this.tx,
      sql`SELECT * FROM payment_intents WHERE reference = ${reference} FOR UPDATE`,
    );
    return r ? toIntent(r) : null;
  }

  async findOrderIntent(orderId: string): Promise<PaymentIntentState | null> {
    const [r] = await rows(
      this.tx,
      sql`SELECT * FROM payment_intents WHERE order_id = ${orderId} AND status <> 'failed'
          ORDER BY created_at DESC LIMIT 1`,
    );
    return r ? toIntent(r) : null;
  }

  async insertIntent(i: PaymentIntentState): Promise<void> {
    await this.tx.execute(sql`INSERT INTO payment_intents
      (id, user_id, purpose, order_id, amount_minor, currency, method, status, provider, reference,
       authorization_url, failure_reason, created_at, updated_at, settled_at)
      VALUES (${i.id}, ${i.userId}, ${i.purpose}, ${i.orderId}, ${i.amount.minor}, ${i.amount.currency},
       ${i.method}, ${i.status}, ${i.provider}, ${i.reference}, ${i.authorizationUrl}, ${i.failureReason},
       ${i.createdAt.toISOString()}, now(), ${i.status === 'succeeded' ? sql`now()` : null})`);
  }

  async updateIntent(i: PaymentIntentState, providerTransactionId?: string): Promise<void> {
    await this.tx.execute(sql`UPDATE payment_intents SET status = ${i.status},
      failure_reason = ${i.failureReason}, updated_at = now(),
      provider_transaction_id = COALESCE(${providerTransactionId ?? null}, provider_transaction_id),
      settled_at = CASE WHEN ${i.status} IN ('succeeded','failed') THEN now() ELSE settled_at END
      WHERE id = ${i.id}`);
  }

  async post(journal: Journal): Promise<{ transactionId: string; created: boolean }> {
    const id = randomUUID();
    const inserted = await rows(
      this.tx,
      sql`INSERT INTO ledger_transactions (id, kind, idempotency_key, reference, reverses_id)
          VALUES (${id}, ${journal.kind}, ${journal.idempotencyKey}, ${journal.reference}, ${journal.reversesId ?? null})
          ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    );
    if (inserted.length === 0) {
      const [existing] = await rows(
        this.tx,
        sql`SELECT id FROM ledger_transactions WHERE idempotency_key = ${journal.idempotencyKey}`,
      );
      return { transactionId: str(existing?.id), created: false };
    }
    for (const line of journal.lines) {
      const accountId = await this.accountId(line.account, line.amount.currency);
      await this.tx
        .execute(sql`INSERT INTO ledger_entries (transaction_id, account_id, amount_minor, currency)
        VALUES (${id}, ${accountId}, ${line.amount.minor}, ${line.amount.currency})`);
    }
    return { transactionId: id, created: true };
  }

  private async accountId(code: string, currency: CurrencyCode): Promise<string> {
    const { type, ownerId } = parseAccountCode(code);
    await this.tx.execute(sql`INSERT INTO ledger_accounts (id, code, type, owner_id, currency)
      VALUES (${randomUUID()}, ${code}, ${type}, ${ownerId}, ${currency})
      ON CONFLICT (code, currency) DO NOTHING`);
    const [r] = await rows(
      this.tx,
      sql`SELECT id FROM ledger_accounts WHERE code = ${code} AND currency = ${currency}`,
    );
    return str(r?.id);
  }

  walletView(userId: string, currency: CurrencyCode, now: Date): Promise<WalletView> {
    return readWalletView(this.tx, userId, currency, now);
  }

  async lockHold(reference: string): Promise<WalletHold | null> {
    const [r] = await rows(
      this.tx,
      sql`SELECT * FROM wallet_holds WHERE reference = ${reference} FOR UPDATE`,
    );
    return r ? toHold(r) : null;
  }

  async insertHold(h: WalletHold): Promise<void> {
    await this.tx
      .execute(sql`INSERT INTO wallet_holds (id, user_id, reference, amount_minor, currency, status, expires_at)
      VALUES (${h.id}, ${h.userId}, ${h.reference}, ${h.amount.minor}, ${h.amount.currency}, ${h.status}, ${h.expiresAt.toISOString()})`);
  }

  async setHoldStatus(id: string, status: WalletHold['status']): Promise<void> {
    await this.tx.execute(
      sql`UPDATE wallet_holds SET status = ${status}, updated_at = now() WHERE id = ${id}`,
    );
  }

  async recordWebhookEvent(provider: string, eventId: string, type: string): Promise<boolean> {
    const r = await rows(
      this.tx,
      sql`INSERT INTO payment_webhook_events (id, provider, event_id, event_type)
          VALUES (${randomUUID()}, ${provider}, ${eventId}, ${type})
          ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`,
    );
    return r.length === 1;
  }

  async orderLines(orderId: string): Promise<PostedLine[]> {
    const r = await rows(
      this.tx,
      sql`SELECT t.kind, a.code, e.amount_minor, e.currency FROM ledger_transactions t
          JOIN ledger_entries e ON e.transaction_id = t.id JOIN ledger_accounts a ON a.id = e.account_id
          WHERE t.reference = ${orderId} ORDER BY e.id`,
    );
    return r.map((x) => ({
      kind: str(x.kind),
      account: str(x.code),
      amount: Money.ofMinor(num(x.amount_minor), cur(x.currency)),
    }));
  }

  async insertRefund(row: Parameters<PaymentsTx['insertRefund']>[0]): Promise<void> {
    await this.tx
      .execute(sql`INSERT INTO payment_refunds (id, order_id, amount_minor, currency, destination, status, reason)
      VALUES (${row.id}, ${row.orderId}, ${row.amount.minor}, ${row.amount.currency}, ${row.destination}, ${row.status}, ${row.reason})`);
  }

  async updateRefund(id: string, status: string, providerRefundId: string | null): Promise<void> {
    await this.tx.execute(sql`UPDATE payment_refunds SET status = ${status},
      provider_refund_id = ${providerRefundId}, updated_at = now() WHERE id = ${id}`);
  }

  async upsertPayout(p: PayoutRow): Promise<PayoutRow> {
    await this.tx
      .execute(sql`INSERT INTO payouts (id, batch_id, account, amount_minor, currency, reference, status)
      VALUES (${p.id}, ${p.batchId}, ${p.account}, ${p.amount.minor}, ${p.amount.currency}, ${p.reference}, ${p.status})
      ON CONFLICT (reference) DO NOTHING`);
    const [r] = await rows(this.tx, sql`SELECT * FROM payouts WHERE reference = ${p.reference}`);
    if (!r) throw new Error('payout row missing after upsert');
    return toPayout(r);
  }

  async updatePayout(
    id: string,
    status: PayoutRow['status'],
    transferCode: string | null,
    error: string | null,
  ): Promise<void> {
    await this.tx.execute(sql`UPDATE payouts SET status = ${status},
      transfer_code = COALESCE(${transferCode}, transfer_code), last_error = ${error}, updated_at = now()
      WHERE id = ${id}`);
  }

  async lockPayoutByReference(reference: string): Promise<PayoutRow | null> {
    const [r] = await rows(
      this.tx,
      sql`SELECT * FROM payouts WHERE reference = ${reference} FOR UPDATE`,
    );
    return r ? toPayout(r) : null;
  }

  async journalLines(key: string): Promise<{ id: string; lines: JournalLine[] } | null> {
    const r = await rows(
      this.tx,
      sql`SELECT t.id, a.code, e.amount_minor, e.currency FROM ledger_transactions t
          JOIN ledger_entries e ON e.transaction_id = t.id JOIN ledger_accounts a ON a.id = e.account_id
          WHERE t.idempotency_key = ${key} ORDER BY e.id`,
    );
    const first = r[0];
    if (!first) return null;
    return {
      id: str(first.id),
      lines: r.map((x) => ({
        account: str(x.code),
        amount: Money.ofMinor(num(x.amount_minor), cur(x.currency)),
      })),
    };
  }

  async appendEvent(e: PaymentsEvent): Promise<void> {
    await appendToOutbox(this.tx as Executor, e);
  }
}

/** Drizzle/Postgres implementation of {@link PaymentsStore}. Ledger queries are raw SQL. */
export class DrizzlePaymentsStore implements PaymentsStore {
  /** @param db drizzle handle */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  transaction<T>(fn: (tx: PaymentsTx) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new DrizzlePaymentsTx(tx)));
  }

  /** @inheritdoc */
  async findIntent(id: string): Promise<PaymentIntentState | null> {
    const [r] = await rows(this.db, sql`SELECT * FROM payment_intents WHERE id = ${id}`);
    return r ? toIntent(r) : null;
  }

  /** @inheritdoc */
  walletView(userId: string, currency: CurrencyCode, now: Date): Promise<WalletView> {
    return readWalletView(this.db, userId, currency, now);
  }

  /** @inheritdoc */
  async walletTransactions(
    userId: string,
    currency: CurrencyCode,
    limit: number,
    cursor: string | undefined,
  ): Promise<{ items: WalletTransaction[]; nextCursor: string | null }> {
    const before = cursor && /^\d+$/.test(cursor) ? Number(cursor) : Number.MAX_SAFE_INTEGER;
    const r = await rows(
      this.db,
      sql`SELECT e.id, t.kind, t.reference, e.amount_minor, e.currency, e.created_at
          FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
          JOIN ledger_transactions t ON t.id = e.transaction_id
          WHERE a.code = ${`customer_wallet:${userId}`} AND a.currency = ${currency} AND e.id < ${before}
          ORDER BY e.id DESC LIMIT ${limit + 1}`,
    );
    const page = r.slice(0, limit);
    const items = page.map((x) => ({
      id: str(x.id),
      kind: str(x.kind),
      // Customer view: credits to the wallet are positive.
      amount: { amountMinor: -num(x.amount_minor), currency: 'NGN' as const },
      reference: x.reference === null ? null : str(x.reference),
      createdAt: new Date(str(x.created_at)).toISOString(),
    }));
    const last = page.at(-1);
    return { items, nextCursor: r.length > limit && last ? str(last.id) : null };
  }

  /** @inheritdoc */
  async payableBalances(
    type: 'vendor_payable' | 'rider_payable',
    currency: CurrencyCode,
  ): Promise<{ account: string; payeeId: string; balance: Money }[]> {
    const r = await rows(
      this.db,
      sql`SELECT a.code, a.owner_id, -COALESCE(sum(e.amount_minor), 0) AS bal
          FROM ledger_accounts a JOIN ledger_entries e ON e.account_id = a.id
          WHERE a.type = ${type} AND a.currency = ${currency}
          GROUP BY a.code, a.owner_id HAVING -sum(e.amount_minor) > 0 ORDER BY a.code`,
    );
    return r.map((x) => ({
      account: str(x.code),
      payeeId: str(x.owner_id),
      balance: Money.ofMinor(num(x.bal), currency),
    }));
  }

  /** @inheritdoc */
  async recipientFor(account: string): Promise<string | null> {
    const [r] = await rows(
      this.db,
      sql`SELECT recipient_code FROM payout_recipients WHERE account = ${account}`,
    );
    return r ? str(r.recipient_code) : null;
  }

  /** @inheritdoc */
  async settledCharges(provider: string, from: Date, to: Date): Promise<SettledCharge[]> {
    const r = await rows(
      this.db,
      sql`SELECT reference, amount_minor, currency FROM payment_intents
          WHERE provider = ${provider} AND status IN ('succeeded','refunded')
            AND settled_at >= ${from.toISOString()} AND settled_at < ${to.toISOString()}`,
    );
    return r.map((x) => ({
      reference: str(x.reference),
      amount: Money.ofMinor(num(x.amount_minor), cur(x.currency)),
    }));
  }
}
