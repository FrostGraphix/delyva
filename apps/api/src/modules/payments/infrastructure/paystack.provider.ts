import { type CurrencyCode, Money } from '@delyva/utils';
import { z } from 'zod';
import type { PaymentProvider, ProviderChannel } from '../application/ports.js';
import type { VerifiedCharge } from '../domain/payment-intent.js';
import type { SettledCharge } from '../domain/reconciliation.js';

/** Paystack adapter configuration (from env). */
export interface PaystackConfig {
  readonly secretKey: string;
  readonly baseUrl: string;
  readonly timeoutMs?: number;
}

/** Thrown when Paystack returns a non-2xx or `status: false` response. */
export class PaystackError extends Error {
  /** @param message safe summary (no secrets) @param httpStatus HTTP status */
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'PaystackError';
  }
}

// Shapes below follow the official Paystack OpenAPI spec (github.com/PaystackOSS/openapi):
// TransactionInitializeResponse, VerifyResponse, RefundCreateResponse, TransferRecipientCreateResponse,
// TransferCreateResponse, VerificationResolveAccountNumberResponse, TransactionListResponse.
const InitData = z.object({
  authorization_url: z.string(),
  access_code: z.string(),
  reference: z.string(),
});
const VerifyData = z.object({
  id: z.number().int(),
  status: z.string(),
  reference: z.string(),
  amount: z.number().int(),
  currency: z.string(),
});
const RefundData = z.object({
  id: z.number().int().optional(),
  transaction: z.object({ id: z.number().int() }).optional(),
});
const RecipientData = z.object({ recipient_code: z.string() });
const TransferData = z.object({ transfer_code: z.string(), status: z.string() });
const ResolveData = z.object({ account_number: z.string(), account_name: z.string() });

const ListResponse = z.object({
  status: z.literal(true),
  data: z.array(VerifyData),
  meta: z.object({ page: z.number().int(), pageCount: z.number().int() }),
});

const PER_PAGE = 100;

/** Paystack REST adapter. Only verified, documented fields are read. */
export class PaystackProvider implements PaymentProvider {
  /** @inheritdoc */
  readonly name = 'paystack';

  /** @param config secret + base URL from env */
  constructor(private readonly config: PaystackConfig) {}

  /** POST /transaction/initialize */
  async initialize(input: {
    reference: string;
    amount: Money;
    email: string;
    channels: readonly ProviderChannel[];
    metadata: Record<string, string>;
  }): Promise<{ authorizationUrl: string; reference: string }> {
    const body = {
      email: input.email,
      amount: input.amount.minor,
      currency: input.amount.currency,
      reference: input.reference,
      channels: input.channels,
      metadata: input.metadata,
    };
    const data = await this.call('POST', '/transaction/initialize', InitData, body);
    return { authorizationUrl: data.authorization_url, reference: data.reference };
  }

  /** GET /transaction/verify/{reference} */
  async verify(reference: string): Promise<VerifiedCharge> {
    const d = await this.call(
      'GET',
      `/transaction/verify/${encodeURIComponent(reference)}`,
      VerifyData,
    );
    return toCharge(d);
  }

  /** POST /refund */
  async refund(input: { reference: string; amount: Money }): Promise<{ providerRefundId: string }> {
    const d = await this.call('POST', '/refund', RefundData, {
      transaction: input.reference,
      amount: input.amount.minor,
      currency: input.amount.currency,
    });
    // DEBT(payments): refund id field placement not confirmed by the spec — store whichever id is present — confirm with a sandbox refund.
    return { providerRefundId: String(d.id ?? d.transaction?.id ?? 'unknown') };
  }

  /** POST /transferrecipient (type nuban) */
  async createTransferRecipient(input: {
    name: string;
    accountNumber: string;
    bankCode: string;
    currency: CurrencyCode;
  }): Promise<{ recipientCode: string }> {
    const d = await this.call('POST', '/transferrecipient', RecipientData, {
      type: 'nuban',
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: input.currency,
    });
    return { recipientCode: d.recipient_code };
  }

  /** POST /transfer (source balance); `reference` gives provider-side idempotency. */
  async transfer(input: {
    amount: Money;
    recipientCode: string;
    reference: string;
    reason: string;
  }): Promise<{ transferCode: string; status: string }> {
    const d = await this.call('POST', '/transfer', TransferData, {
      source: 'balance',
      amount: input.amount.minor,
      currency: input.amount.currency,
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason,
    });
    return { transferCode: d.transfer_code, status: d.status };
  }

  /** GET /bank/resolve?account_number&bank_code */
  async resolveBankAccount(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountNumber: string; accountName: string }> {
    const qs = new URLSearchParams({
      account_number: input.accountNumber,
      bank_code: input.bankCode,
    });
    const d = await this.call('GET', `/bank/resolve?${qs.toString()}`, ResolveData);
    return { accountNumber: d.account_number, accountName: d.account_name };
  }

  /** GET /transaction?status=success&from&to&per_page&page (all pages). */
  async listSuccessfulCharges(input: { from: Date; to: Date }): Promise<SettledCharge[]> {
    const out: SettledCharge[] = [];
    for (let page = 1; ; page += 1) {
      const qs = new URLSearchParams({
        status: 'success',
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        per_page: String(PER_PAGE),
        page: String(page),
      });
      const res = await this.request('GET', `/transaction?${qs.toString()}`);
      const parsed = ListResponse.parse(res);
      for (const t of parsed.data) {
        out.push({
          reference: t.reference,
          amount: Money.ofMinor(t.amount, t.currency as CurrencyCode),
        });
      }
      if (parsed.meta.page >= parsed.meta.pageCount) return out;
    }
  }

  private async call<T extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    data: T,
    body?: unknown,
  ): Promise<z.infer<T>> {
    const json = await this.request(method, path, body);
    const inner = (json as { data?: unknown } | null)?.data;
    const parsed = data.safeParse(inner);
    if (!parsed.success) {
      throw new PaystackError(`Unexpected Paystack response for ${path.split('?')[0] ?? ''}`, 502);
    }
    return parsed.data;
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.secretKey}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
    });
    const json: unknown = await res.json().catch(() => null);
    const ok = (json as { status?: unknown } | null)?.status === true;
    if (!res.ok || !ok) {
      throw new PaystackError(`Paystack ${method} ${path.split('?')[0] ?? ''} failed`, res.status);
    }
    return json;
  }
}

/** Normalises a Paystack transaction; only `success` counts as paid. */
export function toCharge(d: z.infer<typeof VerifyData>): VerifiedCharge {
  const failed = ['failed', 'abandoned', 'reversed'];
  const outcome =
    d.status === 'success' ? 'success' : failed.includes(d.status) ? 'failed' : 'pending';
  return {
    reference: d.reference,
    outcome,
    amount: Money.ofMinor(d.amount, d.currency as CurrencyCode),
    providerTransactionId: String(d.id),
  };
}
