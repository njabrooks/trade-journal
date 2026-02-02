import { db } from '@/db';
import { cashBalances, type NewCashBalance } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export interface CashBalanceInput {
  accountId: string;
  snapshotDate: string;
  currency: string;
  balance: string;
  balanceUsd: string | null;
  source: string;
}

/**
 * Upsert cash balances for an account + snapshot date + source.
 * Deletes existing records for the same (accountId, snapshotDate, source)
 * then inserts new ones. Idempotent per ingestion run.
 */
export async function upsertCashBalances(
  inputs: CashBalanceInput[]
): Promise<number> {
  if (inputs.length === 0) return 0;

  // Group by (accountId, snapshotDate, source) for batch delete
  const groups = new Map<string, CashBalanceInput[]>();
  for (const input of inputs) {
    const key = `${input.accountId}::${input.snapshotDate}::${input.source}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(input);
  }

  let inserted = 0;
  for (const group of groups.values()) {
    const { accountId, snapshotDate, source } = group[0];

    await db
      .delete(cashBalances)
      .where(
        and(
          eq(cashBalances.accountId, accountId),
          eq(cashBalances.snapshotDate, snapshotDate),
          eq(cashBalances.source, source)
        )
      );

    const values: NewCashBalance[] = group.map((input) => ({
      accountId: input.accountId,
      snapshotDate: input.snapshotDate,
      currency: input.currency,
      balance: input.balance,
      balanceUsd: input.balanceUsd,
      source: input.source,
    }));

    await db.insert(cashBalances).values(values);
    inserted += values.length;
  }

  return inserted;
}
