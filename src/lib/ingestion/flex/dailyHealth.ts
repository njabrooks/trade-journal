import { and, gte, inArray } from 'drizzle-orm';
import { cashBalances, navSnapshots, positions } from '@/db/schema';

type DatabaseLike = Pick<typeof import('@/db').db, 'select'>;

export type FlexFailureDisposition = 'expected' | 'failed';

/**
 * Flex publishes a daily statement at a variable time. These errors mean the
 * statement is not available yet, rather than that the portfolio source is
 * down. The end-of-window daily health check is responsible for detecting a
 * day where publication never resulted in a successful capture.
 */
export function isFlexStatementNotReady(message: string): boolean {
  return /statement could not be generated at this time/i.test(message);
}

/**
 * Determine whether a failed Flex attempt should affect the scheduled job.
 * Once an account has a successful position capture today, later attempts
 * are informational because Flex is being polled to catch publication time.
 */
export function classifyFlexFailure(
  message: string,
  dailyPositionCaptured: boolean,
): FlexFailureDisposition {
  return dailyPositionCaptured || isFlexStatementNotReady(message)
    ? 'expected'
    : 'failed';
}

/**
 * Find accounts whose Flex-backed daily data was written today. Positions are
 * not sufficient on their own because an account can be cash-only, so NAV and
 * cash writes also count as evidence of a successful position statement.
 */
export async function getDailyFlexPositionCoverage(
  database: DatabaseLike,
  accountIds: string[],
  now = new Date(),
): Promise<Set<string>> {
  if (accountIds.length === 0) return new Set();

  const dayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));

  const [positionRows, navRows, cashRows] = await Promise.all([
    database
      .select({ accountId: positions.accountId })
      .from(positions)
      .where(and(inArray(positions.accountId, accountIds), gte(positions.updatedAt, dayStart))),
    database
      .select({ accountId: navSnapshots.accountId })
      .from(navSnapshots)
      .where(and(inArray(navSnapshots.accountId, accountIds), gte(navSnapshots.createdAt, dayStart))),
    database
      .select({ accountId: cashBalances.accountId })
      .from(cashBalances)
      .where(and(inArray(cashBalances.accountId, accountIds), gte(cashBalances.createdAt, dayStart))),
  ]);

  return new Set([
    ...positionRows.map((row) => row.accountId),
    ...navRows.map((row) => row.accountId),
    ...cashRows.map((row) => row.accountId),
  ]);
}
