/** Pure reporting logic. No database imports: safe for unit tests. */
export interface CloseWindow {
  since: string;
  through: string;
}

export function londonDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
}

function validateDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid --since date: ${value}; expected YYYY-MM-DD`);
  }
}

/** Weekdays only, deliberately no exchange/bank-holiday calendar. Both bounds inclusive. */
export function closeWindow(since?: string, now = new Date()): CloseWindow {
  const through = londonDate(now);
  if (since !== undefined) {
    validateDate(since);
    if (since > through) throw new Error('--since must not be later than today in Europe/London');
    return { since, through };
  }
  const previous = new Date(`${through}T00:00:00Z`);
  do {
    previous.setUTCDate(previous.getUTCDate() - 1);
  } while (previous.getUTCDay() === 0 || previous.getUTCDay() === 6);
  return { since: previous.toISOString().slice(0, 10), through };
}

export function closeWindowFromArgs(args: string[], now = new Date()): CloseWindow {
  const index = args.indexOf('--since');
  if (index < 0) return closeWindow(undefined, now);
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error('--since requires YYYY-MM-DD');
  return closeWindow(value, now);
}

export interface ClosedStrategyScope extends Record<string, unknown> {
  strategyId: string;
  strategyKey: string;
  strategyName: string | null;
  status: string;
  accountId: string | null;
  accountLabel: string | null;
  underlying: string | null;
  symbols: string[];
  snapshotDate: string | null;
  totalAbsNotional: string | number | null;
  totalUnrealizedPnl: string | number | null;
  numOpenPositions: number | null;
  realizedPnlToDate: string | number | null;
  realizedConfidence: string | null;
  previousSnapshotDate: string | null;
  previousRealizedPnl: string | number | null;
  hasInterveningTrades: boolean;
  periodBaselineDate: string | null;
  periodBaselineRealizedPnl: string | number | null;
  hasPreWindowTrades: boolean;
  firstTradeDate: string | null;
  lastOpenPositionDate: string | null;
  lastClosingTradeDate: string | null;
}

function numberOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

/** Mirrors writeClosingSnapshotIfNeeded; NULL marks on ordinary rows are not zeros. */
export function isClosingSnapshot(row: ClosedStrategyScope): boolean {
  return row.snapshotDate !== null &&
    (row.lastOpenPositionDate === null || row.lastOpenPositionDate < row.snapshotDate) &&
    numberOrNull(row.totalAbsNotional) === 0 &&
    numberOrNull(row.totalUnrealizedPnl) === 0 &&
    (row.numOpenPositions === null || row.numOpenPositions === 0);
}

export type CloseHealthIssue = 'no_closing_snapshot' | 'no_closing_trade';

/** A reducing fill is evidence, not proof of a complete round trip or complete history. */
export function classifyCloseHealth(row: ClosedStrategyScope): CloseHealthIssue[] {
  if (row.status !== 'complete') return [];
  const terminal = isClosingSnapshot(row);
  const issues: CloseHealthIssue[] = [];
  if (!terminal) issues.push('no_closing_snapshot');
  const hasClosingTrade = row.lastClosingTradeDate !== null &&
    (row.lastOpenPositionDate === null || row.lastClosingTradeDate >= row.lastOpenPositionDate) &&
    (!terminal || row.lastClosingTradeDate! <= row.snapshotDate!);
  if (!hasClosingTrade) issues.push('no_closing_trade');
  return issues;
}

const roundUsd = (value: number) => Math.round(value * 100) / 100;

function realizedChange(
  row: ClosedStrategyScope,
  baselineDate: string | null,
  baselineValue: string | number | null,
  boundary: string,
): number | null {
  const end = numberOrNull(row.realizedPnlToDate);
  // Zero before the first linked trade is the engine's initial state. A missing
  // value on an existing snapshot is unknown, even when the trade history is full.
  const baseline = baselineDate !== null ? numberOrNull(baselineValue)
    : row.firstTradeDate !== null && row.firstTradeDate >= boundary ? 0 : null;
  return end === null || baseline === null ? null : roundUsd(end - baseline);
}

function identity(row: ClosedStrategyScope) {
  return {
    strategyId: row.strategyId,
    strategyKey: row.strategyKey,
    strategyName: row.strategyName ?? row.strategyKey,
    accountId: row.accountId,
    accountLabel: row.accountLabel,
    underlying: row.underlying,
    symbols: row.symbols,
  };
}

export function buildClosedStrategyReport(rows: ClosedStrategyScope[], window: CloseWindow) {
  const closedStrategies = rows
    .filter((row) => isClosingSnapshot(row) && row.snapshotDate! >= window.since &&
      row.snapshotDate! <= window.through && row.status !== 'merged' && row.status !== 'rejected')
    .map((row) => ({
      ...identity(row),
      closeDate: row.snapshotDate!,
      previousSnapshotDate: row.previousSnapshotDate,
      periodBaselineDate: row.periodBaselineDate,
      // A gap with trades can contain earlier realizations: don't label their
      // combined delta as closing-day P&L.
      realizedPnlClosingDayUsd: row.hasInterveningTrades ? null
        : realizedChange(row, row.previousSnapshotDate, row.previousRealizedPnl, row.snapshotDate!),
      realizedPnlToDateUsd: numberOrNull(row.realizedPnlToDate),
      realizedPnlPeriodUsd: row.hasPreWindowTrades ? null
        : realizedChange(row, row.periodBaselineDate, row.periodBaselineRealizedPnl, window.since),
      realizedConfidence: row.realizedConfidence,
    }))
    .sort((a, b) => b.closeDate.localeCompare(a.closeDate) ||
      a.strategyId.localeCompare(b.strategyId) || (a.accountId ?? '').localeCompare(b.accountId ?? ''));

  const unknownPeriodPnlCount = closedStrategies.filter((row) => row.realizedPnlPeriodUsd === null).length;
  const knownRealizedPnlPeriodUsd = roundUsd(closedStrategies.reduce(
    (sum, row) => sum + (row.realizedPnlPeriodUsd ?? 0), 0));

  return {
    closedSinceLastPull: {
      ...window,
      strategies: closedStrategies,
      realizedPnlPeriodUsd: unknownPeriodPnlCount === 0 ? knownRealizedPnlPeriodUsd : null,
      knownRealizedPnlPeriodUsd,
      unknownPeriodPnlCount,
    },
    closedStrategyHealth: rows.flatMap((row) => {
      const issues = classifyCloseHealth(row);
      return issues.length === 0 ? [] : [{ ...identity(row), issues,
        latestSnapshotDate: row.snapshotDate,
        lastOpenPositionDate: row.lastOpenPositionDate,
        lastClosingTradeDate: row.lastClosingTradeDate,
      }];
    }),
  };
}
