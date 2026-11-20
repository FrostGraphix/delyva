import type { Wallet, WalletTransactionsPage } from '@delyva/contracts';
import { toMoneyDto } from './dto.js';
import type { Clock, PaymentsStore } from './ports.js';

/** Query: the caller's wallet, derived from the ledger minus active holds. */
export class GetWallet {
  /** @param store payments store @param clock clock */
  constructor(
    private readonly store: PaymentsStore,
    private readonly clock: Clock,
  ) {}

  /** Executes the query for the authenticated user only. */
  async execute(userId: string): Promise<Wallet> {
    const view = await this.store.walletView(userId, 'NGN', this.clock.now());
    return {
      balance: toMoneyDto(view.balance),
      held: toMoneyDto(view.held),
      available: toMoneyDto(view.available),
    };
  }
}

/** Query: the caller's wallet movements, newest first. */
export class ListWalletTransactions {
  /** @param store payments store */
  constructor(private readonly store: PaymentsStore) {}

  /** Executes the query for the authenticated user only. */
  execute(input: {
    userId: string;
    limit: number;
    cursor: string | undefined;
  }): Promise<WalletTransactionsPage> {
    return this.store.walletTransactions(input.userId, 'NGN', input.limit, input.cursor);
  }
}
