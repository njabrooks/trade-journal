/**
 * Verify that every active IBKR Flex position configuration has produced one
 * successful daily account capture. Flex's polling attempts are intentionally
 * not required to succeed individually; this is the end-of-window assertion.
 */

import { db, closeDb } from './lib/db.js';
import { and, eq, inArray } from 'drizzle-orm';
import { accounts, flexQueryConfigs } from '../src/db/schema.js';
import { getDailyFlexPositionCoverage } from '../src/lib/ingestion/flex/dailyHealth.js';

async function main() {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) {
    console.log('IBKR Flex daily health check skipped on the weekend.');
    await closeDb();
    return;
  }

  const configs = await db
    .select({ accountId: flexQueryConfigs.accountId })
    .from(flexQueryConfigs)
    .where(and(eq(flexQueryConfigs.isActive, true), eq(flexQueryConfigs.queryType, 'positions')));

  const accountIds = [...new Set(configs.map((config) => config.accountId))];
  if (accountIds.length === 0) {
    console.log('No active IBKR Flex position configurations found.');
    await closeDb();
    return;
  }

  const covered = await getDailyFlexPositionCoverage(db, accountIds, now);
  const accountRows = await db
    .select({ id: accounts.id, label: accounts.label, brokerAccountId: accounts.brokerAccountId })
    .from(accounts)
    .where(inArray(accounts.id, accountIds));
  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  const missing = accountIds.filter((accountId) => !covered.has(accountId));

  console.log(`IBKR Flex daily coverage: ${accountIds.length - missing.length}/${accountIds.length} account(s)`);
  if (missing.length > 0) {
    for (const accountId of missing) {
      const account = accountById.get(accountId);
      console.log(`::error::No successful Flex position capture today for ${account?.label || account?.brokerAccountId || accountId}`);
    }
    await closeDb();
    process.exit(1);
  }

  console.log('✅ Every active IBKR Flex account has a successful daily position capture.');
  await closeDb();
}

main().catch(async (error) => {
  console.error('IBKR Flex daily health check failed:', error);
  await closeDb();
  process.exit(1);
});
