import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildClosedStrategyReport,
  classifyCloseHealth,
  closeWindow,
  closeWindowFromArgs,
  gatherClosedStrategiesSoftly,
  isClosingSnapshot,
  type ClosedStrategyScope,
} from '../src/lib/portfolio/closedStrategies';

const window = { since: '2026-10-15', through: '2026-11-03' };

function scope(overrides: Partial<ClosedStrategyScope> = {}): ClosedStrategyScope {
  return {
    strategyId: 'tsla-calls', strategyKey: 'TSLA-call', strategyName: 'TSLA Dec $370 calls',
    status: 'complete', accountId: 'ibkr-1', accountLabel: 'IBKR', underlying: 'TSLA',
    symbols: ['TSLA 261218C00370000'], snapshotDate: '2026-10-16',
    totalAbsNotional: '0', totalUnrealizedPnl: '0', numOpenPositions: null,
    realizedPnlToDate: '-134500.25', realizedConfidence: 'full',
    previousSnapshotDate: '2026-10-15', previousRealizedPnl: '1000', hasInterveningTrades: false,
    periodBaselineDate: '2026-10-14', periodBaselineRealizedPnl: '500',
    hasPreWindowTrades: false,
    firstTradeDate: '2026-09-01', lastOpenPositionDate: '2026-10-15',
    lastClosingTradeDate: '2026-10-16', ...overrides,
  };
}

describe('closed-strategy window', () => {
  it.each([
    ['2026-11-03T12:00:00Z', '2026-11-02', '2026-11-03'], // Tuesday
    ['2026-11-02T12:00:00Z', '2026-10-30', '2026-11-02'], // Monday
    ['2026-11-01T12:00:00Z', '2026-10-30', '2026-11-01'], // Sunday
    ['2026-10-31T12:00:00Z', '2026-10-30', '2026-10-31'], // Saturday
    ['2026-01-01T12:00:00Z', '2025-12-31', '2026-01-01'], // year boundary
    ['2024-03-01T12:00:00Z', '2024-02-29', '2024-03-01'], // leap day
    ['2026-07-05T23:30:00Z', '2026-07-03', '2026-07-06'], // London is Monday
    ['2026-10-25T01:30:00Z', '2026-10-23', '2026-10-25'], // DST ends
    ['2026-03-29T00:30:00Z', '2026-03-27', '2026-03-29'], // DST starts
  ])('uses London calendar days at %s', (now, since, through) => {
    expect(closeWindow(undefined, new Date(now))).toEqual({ since, through });
  });

  it('accepts an explicit inclusive date, including today or a weekend', () => {
    const now = new Date('2026-11-03T12:00:00Z');
    expect(closeWindow('2026-11-03', now)).toEqual({ since: '2026-11-03', through: '2026-11-03' });
    expect(closeWindowFromArgs(['--json', '--since', '2026-11-01'], now).since).toBe('2026-11-01');
  });

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', 'today', '', '2026-11-04'])('rejects invalid/future date %s', (since) => {
    expect(() => closeWindow(since, new Date('2026-11-03T12:00:00Z'))).toThrow();
  });

  it('rejects missing --since values instead of silently using the default', () => {
    expect(() => closeWindowFromArgs(['--since'])).toThrow('--since requires');
    expect(() => closeWindowFromArgs(['--since', '--format', 'json'])).toThrow('--since requires');
  });
});

describe('morning-brief closed-strategy soft failure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null sections and an error, with a single-line stderr warning and no stdout', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = await gatherClosedStrategiesSoftly(async () => {
      throw new Error('query failed\nhealth check unavailable');
    });

    expect(result).toEqual({
      closedSinceLastPull: null,
      closedStrategyHealth: null,
      closedStrategiesError: 'query failed\nhealth check unavailable',
    });
    expect(stderr).toHaveBeenCalledExactlyOnceWith(
      'Warning: closed strategies unavailable: query failed health check unavailable\n',
    );
    expect(stdout).not.toHaveBeenCalled();
  });

  it('also catches synchronous throws with non-Error values', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await gatherClosedStrategiesSoftly(() => { throw 'connection lost'; });
    expect(result).toEqual({
      closedSinceLastPull: null,
      closedStrategyHealth: null,
      closedStrategiesError: 'connection lost',
    });
    expect(stderr).toHaveBeenCalledOnce();
  });

  it('passes a successful report through with a null error and no warning', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const report = buildClosedStrategyReport([scope()], window);
    const gather = vi.fn(async () => report);
    const result = await gatherClosedStrategiesSoftly(gather);

    expect(gather).toHaveBeenCalledOnce();
    expect(result).toEqual({ ...report, closedStrategiesError: null });
    expect(result.closedSinceLastPull).toBe(report.closedSinceLastPull);
    expect(result.closedStrategyHealth).toBe(report.closedStrategyHealth);
    expect(Object.keys(result)).toEqual([
      'closedSinceLastPull', 'closedStrategyHealth', 'closedStrategiesError',
    ]);
    expect(stderr).not.toHaveBeenCalled();
  });
});

describe('closing-snapshot classification', () => {
  it('requires explicit flat marks; ordinary null or zero-unrealised open rows are not terminal', () => {
    expect(isClosingSnapshot(scope())).toBe(true);
    expect(isClosingSnapshot(scope({ numOpenPositions: 0 }))).toBe(true);
    for (const override of [
      { totalAbsNotional: null }, { totalUnrealizedPnl: null },
      { totalAbsNotional: '123' }, { numOpenPositions: 1 }, { snapshotDate: null },
      { lastOpenPositionDate: '2026-10-17' }, { lastOpenPositionDate: '2026-10-16' },
    ]) expect(isClosingSnapshot(scope(override))).toBe(false);
  });
});

describe('closed-strategy aggregation', () => {
  it('distinguishes closing-day, lifetime and period P&L without double counting lifetime gains', () => {
    const { closedSinceLastPull: report } = buildClosedStrategyReport([scope()], window);
    expect(report.strategies[0]).toMatchObject({
      strategyId: 'tsla-calls', accountLabel: 'IBKR', closeDate: '2026-10-16',
      realizedPnlClosingDayUsd: -135500.25,
      realizedPnlToDateUsd: -134500.25,
      realizedPnlPeriodUsd: -135000.25,
      realizedConfidence: 'full',
    });
    expect(report.realizedPnlPeriodUsd).toBe(-135000.25);
  });

  it('includes both date boundaries, keeps accounts separate, and excludes nonterminal/merged/rejected scopes', () => {
    const report = buildClosedStrategyReport([
      scope({ snapshotDate: window.since, lastOpenPositionDate: '2026-10-14' }),
      scope({ snapshotDate: window.through, accountId: 'ibkr-2' }),
      scope({ snapshotDate: '2026-10-14' }),
      scope({ snapshotDate: '2026-11-04' }),
      scope({ numOpenPositions: 2 }), scope({ status: 'merged' }), scope({ status: 'rejected' }),
    ], window).closedSinceLastPull;
    expect(report.strategies.map((s) => s.accountId)).toEqual(['ibkr-2', 'ibkr-1']);
    expect(report.realizedPnlPeriodUsd).toBe(-270000.5);
  });

  it('reports terminal rows while status propagation still says active', () => {
    expect(buildClosedStrategyReport([scope({ status: 'active' })], window)
      .closedSinceLastPull.strategies).toHaveLength(1);
  });

  it('preserves partial-history flags and unknown values without silently turning them into zeros', () => {
    const report = buildClosedStrategyReport([
      scope({ realizedConfidence: 'partial_history' }),
      scope({ accountId: 'ibkr-2', realizedPnlToDate: null, realizedConfidence: 'no_trades' }),
      scope({ accountId: 'ibkr-3', periodBaselineRealizedPnl: null }),
    ], window).closedSinceLastPull;
    expect(report.realizedPnlPeriodUsd).toBeNull();
    expect(report.knownRealizedPnlPeriodUsd).toBe(-135000.25);
    expect(report.unknownPeriodPnlCount).toBe(2);
    expect(report.strategies[0].realizedConfidence).toBe('partial_history');
    expect(report.strategies[1].realizedPnlToDateUsd).toBeNull();
  });

  it('uses zero only before the first linked trade; missing history before the window stays unknown', () => {
    const row = scope({ periodBaselineDate: null, periodBaselineRealizedPnl: null });
    expect(buildClosedStrategyReport([row], window).closedSinceLastPull.realizedPnlPeriodUsd).toBeNull();
    expect(buildClosedStrategyReport([{ ...row, firstTradeDate: window.since }], window)
      .closedSinceLastPull.realizedPnlPeriodUsd).toBe(-134500.25);
  });

  it('does not call a multi-day delta closing-day P&L when there are intervening trades', () => {
    const report = buildClosedStrategyReport([scope({ hasInterveningTrades: true })], window);
    expect(report.closedSinceLastPull.strategies[0].realizedPnlClosingDayUsd).toBeNull();
    expect(report.closedSinceLastPull.realizedPnlPeriodUsd).toBe(-135000.25);
  });

  it('does not include pre-window realizations when the period baseline has a trade-filled gap', () => {
    const report = buildClosedStrategyReport([scope({ hasPreWindowTrades: true })], window);
    expect(report.closedSinceLastPull.strategies[0].realizedPnlPeriodUsd).toBeNull();
    expect(report.closedSinceLastPull.realizedPnlPeriodUsd).toBeNull();
    expect(report.closedSinceLastPull.unknownPeriodPnlCount).toBe(1);
  });

  it('rounds summed USD values and reports zero for an empty period', () => {
    const rows = [scope({ realizedPnlToDate: '0.10', periodBaselineRealizedPnl: '0' }),
      scope({ accountId: 'ibkr-2', realizedPnlToDate: '0.20', periodBaselineRealizedPnl: '0' })];
    expect(buildClosedStrategyReport(rows, window).closedSinceLastPull.realizedPnlPeriodUsd).toBe(0.3);
    expect(buildClosedStrategyReport([], window).closedSinceLastPull).toMatchObject({
      strategies: [], realizedPnlPeriodUsd: 0, knownRealizedPnlPeriodUsd: 0, unknownPeriodPnlCount: 0,
    });
  });
});

describe('complete-strategy health', () => {
  it('classifies missing snapshot, missing closing fill, both, and healthy independently', () => {
    expect(classifyCloseHealth(scope())).toEqual([]);
    expect(classifyCloseHealth(scope({ snapshotDate: null }))).toEqual(['no_closing_snapshot']);
    expect(classifyCloseHealth(scope({ lastClosingTradeDate: null }))).toEqual(['no_closing_trade']);
    expect(classifyCloseHealth(scope({ snapshotDate: null, lastClosingTradeDate: null })))
      .toEqual(['no_closing_snapshot', 'no_closing_trade']);
  });

  it('requires the reducing fill to belong to the final exit, not an older partial reduction', () => {
    expect(classifyCloseHealth(scope({ lastClosingTradeDate: '2026-10-01' }))).toEqual(['no_closing_trade']);
    expect(classifyCloseHealth(scope({ lastClosingTradeDate: '2026-10-17' }))).toEqual(['no_closing_trade']);
    expect(classifyCloseHealth(scope({ lastClosingTradeDate: '2026-10-15' }))).toEqual([]);
  });

  it.each(['active', 'draft', 'rejected', 'merged'])('ignores %s strategies', (status) => {
    expect(classifyCloseHealth(scope({ status, snapshotDate: null, lastClosingTradeDate: null }))).toEqual([]);
  });

  it('reports all-date health issues with account identity, even when no close falls in the window', () => {
    const report = buildClosedStrategyReport([scope({ snapshotDate: '2026-10-01', lastClosingTradeDate: null })], window);
    expect(report.closedSinceLastPull.strategies).toEqual([]);
    expect(report.closedStrategyHealth[0]).toMatchObject({ strategyId: 'tsla-calls', accountId: 'ibkr-1',
      issues: ['no_closing_snapshot', 'no_closing_trade'] });
  });
});
