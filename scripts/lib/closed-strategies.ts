import { db } from './db.js';
import { sql } from 'drizzle-orm';
import {
  buildClosedStrategyReport,
  type ClosedStrategyScope,
  type CloseWindow,
} from '../../src/lib/portfolio/closedStrategies.js';

/** SELECT only. Keep account/strategy grain: a strategy may span several accounts. */
export async function gatherClosedStrategies(window: CloseWindow, accountIds?: string[]) {
  if (accountIds?.length === 0) return buildClosedStrategyReport([], window);
  const accountFilter = accountIds === undefined ? sql`TRUE`
    : sql`scope.account_id IN (${sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `)})`;

  const rows = await db.execute<ClosedStrategyScope>(sql`
    WITH scopes AS (
      SELECT id AS strategy_id, account_id FROM strategies WHERE account_id IS NOT NULL
      UNION SELECT strategy_id, account_id FROM strategy_metrics_snapshots
      UNION SELECT strategy_id, account_id FROM positions WHERE strategy_id IS NOT NULL
      UNION SELECT strategy_id, account_id FROM trades WHERE strategy_id IS NOT NULL
      UNION SELECT id, NULL::uuid FROM strategies s WHERE account_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM strategy_metrics_snapshots m WHERE m.strategy_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM positions p WHERE p.strategy_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM trades t WHERE t.strategy_id = s.id)
    ), signed_trades AS (
      SELECT t.*, CASE
        WHEN UPPER(t.asset_class) IN ('CRYPTO', 'PERP') THEN
          CASE WHEN UPPER(t.side) = 'SELL' THEN -ABS(t.quantity) ELSE ABS(t.quantity) END
        WHEN UPPER(t.side) = 'SELL' AND t.quantity > 0 THEN -t.quantity
        ELSE t.quantity END AS signed_qty
      FROM trades t JOIN strategies s ON s.id = t.strategy_id
      WHERE s.status = 'complete' AND (t.trade_date AT TIME ZONE 'UTC')::date <= ${window.through}::date
    ), trade_inventory AS (
      SELECT *, SUM(signed_qty) OVER (
        PARTITION BY account_id, strategy_id, symbol ORDER BY trade_date, created_at, id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS prior_qty FROM signed_trades
    ), closing_trades AS (
      SELECT account_id, strategy_id,
        MAX((trade_date AT TIME ZONE 'UTC')::date)::text AS last_date
      FROM trade_inventory WHERE prior_qty * signed_qty < 0
      GROUP BY account_id, strategy_id
    )
    SELECT s.id AS "strategyId", s.strategy_key AS "strategyKey",
      s.auto_derived_label AS "strategyName", s.status,
      scope.account_id AS "accountId", a.label AS "accountLabel", u.ticker AS underlying,
      ARRAY(SELECT DISTINCT p.symbol FROM positions p
        WHERE p.account_id = scope.account_id AND p.strategy_id = s.id
        UNION SELECT DISTINCT t.symbol FROM trades t
        WHERE t.account_id = scope.account_id AND t.strategy_id = s.id ORDER BY symbol) AS symbols,
      latest.snapshot_date::text AS "snapshotDate",
      latest.total_abs_notional AS "totalAbsNotional",
      latest.total_unrealized_pnl AS "totalUnrealizedPnl",
      latest.num_open_positions AS "numOpenPositions",
      latest.realized_pnl_to_date AS "realizedPnlToDate",
      latest.realized_confidence AS "realizedConfidence",
      previous.snapshot_date::text AS "previousSnapshotDate",
      previous.realized_pnl_to_date AS "previousRealizedPnl",
      EXISTS (SELECT 1 FROM trades t WHERE t.account_id = scope.account_id AND t.strategy_id = s.id
        AND (t.trade_date AT TIME ZONE 'UTC')::date > previous.snapshot_date
        AND (t.trade_date AT TIME ZONE 'UTC')::date < latest.snapshot_date) AS "hasInterveningTrades",
      baseline.snapshot_date::text AS "periodBaselineDate",
      baseline.realized_pnl_to_date AS "periodBaselineRealizedPnl",
      EXISTS (SELECT 1 FROM trades t WHERE t.account_id = scope.account_id AND t.strategy_id = s.id
        AND (t.trade_date AT TIME ZONE 'UTC')::date > baseline.snapshot_date
        AND (t.trade_date AT TIME ZONE 'UTC')::date < ${window.since}::date) AS "hasPreWindowTrades",
      (SELECT MIN((t.trade_date AT TIME ZONE 'UTC')::date)::text FROM trades t
        WHERE t.account_id = scope.account_id AND t.strategy_id = s.id) AS "firstTradeDate",
      (SELECT MAX(p.snapshot_date)::text FROM positions p
        WHERE p.account_id = scope.account_id AND p.strategy_id = s.id AND p.quantity != 0
          AND p.snapshot_date <= ${window.through}::date) AS "lastOpenPositionDate",
      ct.last_date AS "lastClosingTradeDate"
    FROM scopes scope JOIN strategies s ON s.id = scope.strategy_id
    LEFT JOIN accounts a ON a.id = scope.account_id
    LEFT JOIN asset_theses thesis ON thesis.id = s.asset_thesis_id
    LEFT JOIN underlyings u ON u.id = thesis.underlying_id
    LEFT JOIN LATERAL (
      SELECT * FROM strategy_metrics_snapshots m
      WHERE m.account_id = scope.account_id AND m.strategy_id = s.id
      ORDER BY m.snapshot_date DESC LIMIT 1
    ) latest ON TRUE
    LEFT JOIN LATERAL (
      SELECT snapshot_date, realized_pnl_to_date FROM strategy_metrics_snapshots m
      WHERE m.account_id = scope.account_id AND m.strategy_id = s.id
        AND m.snapshot_date < latest.snapshot_date
      ORDER BY m.snapshot_date DESC LIMIT 1
    ) previous ON TRUE
    LEFT JOIN LATERAL (
      SELECT snapshot_date, realized_pnl_to_date FROM strategy_metrics_snapshots m
      WHERE m.account_id = scope.account_id AND m.strategy_id = s.id
        AND m.snapshot_date < ${window.since}::date
      ORDER BY m.snapshot_date DESC LIMIT 1
    ) baseline ON TRUE
    LEFT JOIN closing_trades ct ON ct.account_id = scope.account_id AND ct.strategy_id = s.id
    WHERE ${accountFilter}
    ORDER BY s.id, scope.account_id
  `);
  return buildClosedStrategyReport([...rows], window);
}
