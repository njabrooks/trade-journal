import { db } from '@/db';
import { accounts, NewAccount } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Resolves account ID from broker account ID (ClientAccountID).
 * Creates the account lazily if it does not yet exist.
 * Supports caching for performance during batch operations.
 */
export async function resolveAccountId(
  brokerAccountId: string,
  brokerName: string = 'IBKR',
  cache?: Map<string, string>
): Promise<string> {
  // Check cache first
  if (cache?.has(brokerAccountId)) {
    return cache.get(brokerAccountId)!;
  }

  const existing = await db
    .select()
    .from(accounts)
    .where(eq(accounts.brokerAccountId, brokerAccountId))
    .limit(1);

  if (existing.length > 0) {
    const accountId = existing[0].id;
    cache?.set(brokerAccountId, accountId);
    return accountId;
  }

  const [newAccount] = await db
    .insert(accounts)
    .values({
      brokerName,
      brokerAccountId,
      baseCurrency: 'USD',
    })
    .returning();

  cache?.set(brokerAccountId, newAccount.id);
  return newAccount.id;
}

/**
 * Creates or updates an account
 */
export async function upsertAccount(data: {
  brokerAccountId: string;
  brokerName?: string;
  baseCurrency?: string;
  label?: string;
  owner?: string;
}): Promise<string> {
  const existing = await db
    .select()
    .from(accounts)
    .where(eq(accounts.brokerAccountId, data.brokerAccountId))
    .limit(1);

  if (existing.length > 0) {
    // Update existing account
    const [updated] = await db
      .update(accounts)
      .set({
        brokerName: data.brokerName ?? existing[0].brokerName,
        baseCurrency: data.baseCurrency ?? existing[0].baseCurrency,
        label: data.label ?? existing[0].label,
        owner: data.owner ?? existing[0].owner,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, existing[0].id))
      .returning();
    return updated.id;
  }

  // Create new account
  const [newAccount] = await db
    .insert(accounts)
    .values({
      brokerName: data.brokerName ?? 'IBKR',
      brokerAccountId: data.brokerAccountId,
      baseCurrency: data.baseCurrency ?? 'USD',
      label: data.label,
      owner: data.owner,
    })
    .returning();

  return newAccount.id;
}

/**
 * Gets all accounts
 * Note: brokerAccountId is unique, so ordering by it should use the unique index
 */
export async function getAllAccounts() {
  // Use limit to prevent issues with very large result sets
  // Accounts table should be small, but add safety limit
  return await db
    .select()
    .from(accounts)
    .orderBy(accounts.brokerAccountId)
    .limit(1000); // Safety limit - should never hit this
}

/**
 * Gets account by broker account ID
 */
export async function getAccountByBrokerId(brokerAccountId: string) {
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.brokerAccountId, brokerAccountId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Gets account by ID
 */
export async function getAccountById(accountId: string) {
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Updates an account by ID
 */
export async function updateAccount(
  accountId: string,
  data: {
    brokerName?: string;
    baseCurrency?: string;
    label?: string;
  }
) {
  const [updated] = await db
    .update(accounts)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId))
    .returning();
  return updated;
}

/**
 * Deletes an account by ID
 * Note: This will cascade delete related records (trades, positions, etc.)
 * Strategies will have accountId set to null
 */
export async function deleteAccount(accountId: string) {
  const [deleted] = await db
    .delete(accounts)
    .where(eq(accounts.id, accountId))
    .returning();
  return deleted;
}


