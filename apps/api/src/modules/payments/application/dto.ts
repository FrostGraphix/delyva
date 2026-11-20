import type { MoneyDto, PaymentIntent } from '@delyva/contracts';
import type { Money } from '@delyva/utils';
import type { PaymentIntentState } from '../domain/payment-intent.js';
import { PaymentsError } from '../domain/payments-errors.js';

/** Maps Money to the wire shape; only launch currencies are exposed. */
export function toMoneyDto(m: Money): MoneyDto {
  if (m.currency !== 'NGN') throw new PaymentsError('validation_failed', 'Unsupported currency');
  return { amountMinor: m.minor, currency: m.currency };
}

/** Maps an intent to its public DTO (owner view). */
export function toIntentDto(i: PaymentIntentState): PaymentIntent {
  return {
    id: i.id,
    purpose: i.purpose,
    orderId: i.orderId,
    amount: toMoneyDto(i.amount),
    method: i.method,
    status: i.status,
    reference: i.reference,
    authorizationUrl: i.authorizationUrl,
    createdAt: i.createdAt.toISOString(),
  };
}
