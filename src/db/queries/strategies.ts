import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  assetTheses,
  assetThesisRelatedMacroTheses,
  macroTheses,
  navSnapshots,
  positions,
  strategyMetricsSnapshots,
  strategies,
  strategyTemplates,
  trades,
  triageRecords,
  underlyings,
} from "@/db/schema";
import { toNumber } from "@/lib/numbers";

export interface StrategyListItem {
  id: string;
  strategyKey: string;
  label: string | null;
  status: string;
  openedAt: Date | null;
  closedAt: Date | null;
  accountLabel: string | null;
  accountBrokerId: string | null;
  latestAbsNotional: number | null;
  latestUnrealized: number | null;
  latestPctNav: number | null;
  strategyType: string | null;
  assetThesisId: string | null;
  assetViewTitle: string | null;
  // Linked macro theses (via asset thesis junction)
  linkedMacroTheses: Array<{ id: string; title: string }>;
  // Position-derived account IDs (strategies can span multiple accounts after merges)
  positionAccountIds: string[];
}

export async function getStrategiesForList(
  limit = 40,
  filters?: {
    macroThesisId?: string;
    assetThesisId?: string;
    includeClosedStrategies?: boolean;
  }
): Promise<StrategyListItem[]> {
  // Note: We use per-account latest snapshot dates (not a single global date)
  // because different data sources (IBKR, HyperLiquid, etc.) ingest on different schedules.
  // A global MAX(snapshot_date) would cause strategies from slower-ingesting accounts
  // to appear "complete" when a faster-ingesting account pushes the date forward.

  // Build where clause based on filters
  const whereConditions = [];
  if (filters?.assetThesisId) {
    whereConditions.push(eq(strategies.assetThesisId, filters.assetThesisId));
  }

  // Get all strategies with account info
  let query = db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      label: strategies.autoDerivedLabel,
      status: strategies.status,
      openedAt: strategies.openedAt,
      closedAt: strategies.closedAt,
      accountId: strategies.accountId,
      accountLabel: accounts.label,
      accountBrokerId: accounts.brokerAccountId,
      strategyType: strategies.strategyType,
      assetThesisId: strategies.assetThesisId,
      assetViewTitle: assetTheses.title,
    })
    .from(strategies)
    .leftJoin(accounts, eq(strategies.accountId, accounts.id))
    .leftJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
    .$dynamic();

  if (whereConditions.length > 0) {
    query = query.where(and(...whereConditions));
  }

  let rows = await query
    .orderBy(desc(strategies.openedAt))
    .limit(limit * 2); // Get more to filter after determining status

  // If filtering by macroThesisId, we need to filter via junction table
  if (filters?.macroThesisId) {
    const assetThesisIdsForMacro = await db
      .select({ assetThesisId: assetThesisRelatedMacroTheses.assetThesisId })
      .from(assetThesisRelatedMacroTheses)
      .where(eq(assetThesisRelatedMacroTheses.macroThesisId, filters.macroThesisId));

    const validAssetThesisIds = new Set(assetThesisIdsForMacro.map(r => r.assetThesisId));
    rows = rows.filter(r => r.assetThesisId && validAssetThesisIds.has(r.assetThesisId));
  }

  const strategyIds = rows.map((row) => row.id);

  // Compute metrics directly from positions table (not snapshots)
  // This ensures we aggregate across all accounts since strategies can span multiple accounts after merges
  const metricsByStrategy = new Map<
    string,
    {
      totalAbsNotional: number | null;
      totalUnrealizedPnl: number | null;
      pctNavAbsNotional: number | null;
    }
  >();

  if (strategyIds.length > 0) {
    // Compute metrics from positions using each account's latest snapshot date.
    // The subquery ensures we use the most recent data per account, so strategies
    // from accounts with different ingestion schedules all show correct metrics.
    const positionMetrics = await db
      .select({
        strategyId: positions.strategyId,
        totalAbsNotional: sql<string>`SUM(ABS(COALESCE(${positions.absNotional}, 0)))`,
        totalUnrealizedPnl: sql<string>`SUM(COALESCE(${positions.unrealizedPnl}, 0))`,
      })
      .from(positions)
      .where(
        and(
          inArray(positions.strategyId, strategyIds),
          sql`${positions.quantity} != 0`,
          sql`${positions.snapshotDate} = (
            SELECT MAX(p2.snapshot_date)
            FROM positions p2
            WHERE p2.account_id = ${positions.accountId}
          )`
        )
      )
      .groupBy(positions.strategyId);

    // Get latest NAV for pct calculation (sum across all accounts for the latest date)
    const latestNavResult = await db
      .select({
        totalNav: sql<string>`SUM(${navSnapshots.total})`,
      })
      .from(navSnapshots)
      .where(
        sql`${navSnapshots.reportDate} = (
          SELECT MAX(report_date) FROM nav_snapshots
        )`
      );

    const latestNav = toNumber(latestNavResult[0]?.totalNav) ?? 0;

    for (const row of positionMetrics) {
      if (row.strategyId) {
        const absNotional = toNumber(row.totalAbsNotional) ?? 0;
        const pctNav = latestNav > 0 ? (absNotional / latestNav) * 100 : null;
        metricsByStrategy.set(row.strategyId, {
          totalAbsNotional: toNumber(row.totalAbsNotional),
          totalUnrealizedPnl: toNumber(row.totalUnrealizedPnl),
          pctNavAbsNotional: pctNav,
        });
      }
    }
  }


  // Determine actual status based on positions for each account's latest snapshot date.
  // A strategy is "active" if it has open positions in the most recent snapshot for any of its accounts.
  const statusByStrategy = new Map<string, "active" | "complete">();
  if (strategyIds.length > 0) {
    const positionRows = await db
      .select({
        strategyId: positions.strategyId,
      })
      .from(positions)
      .where(
        and(
          inArray(positions.strategyId, strategyIds),
          sql`${positions.quantity} != 0`,
          sql`${positions.snapshotDate} = (
            SELECT MAX(p2.snapshot_date)
            FROM positions p2
            WHERE p2.account_id = ${positions.accountId}
          )`
        )
      )
      .groupBy(positions.strategyId);

    for (const row of positionRows) {
      if (row.strategyId) {
        statusByStrategy.set(row.strategyId, "active");
      }
    }
  }

  // Get linked macro theses for all asset theses
  const assetThesisIds = rows.map(r => r.assetThesisId).filter(Boolean) as string[];
  const macroThesesByAssetThesis = new Map<string, Array<{ id: string; title: string }>>();

  if (assetThesisIds.length > 0) {
    const linkedMacroTheses = await db
      .select({
        assetThesisId: assetThesisRelatedMacroTheses.assetThesisId,
        macroThesisId: macroTheses.id,
        macroThesisTitle: macroTheses.title,
      })
      .from(assetThesisRelatedMacroTheses)
      .innerJoin(macroTheses, eq(assetThesisRelatedMacroTheses.macroThesisId, macroTheses.id))
      .where(inArray(assetThesisRelatedMacroTheses.assetThesisId, assetThesisIds));

    linkedMacroTheses.forEach(lmt => {
      if (!macroThesesByAssetThesis.has(lmt.assetThesisId)) {
        macroThesesByAssetThesis.set(lmt.assetThesisId, []);
      }
      macroThesesByAssetThesis.get(lmt.assetThesisId)!.push({
        id: lmt.macroThesisId,
        title: lmt.macroThesisTitle,
      });
    });
  }

  // Get position-derived account labels for each strategy with abs notional for sorting
  // Strategies can span multiple accounts after merges
  const positionAccountsByStrategy = new Map<string, Array<{ label: string; absNotional: number }>>();
  if (strategyIds.length > 0) {
    const positionAccountRows = await db
      .select({
        strategyId: positions.strategyId,
        accountLabel: accounts.label,
        brokerAccountId: accounts.brokerAccountId,
        totalAbsNotional: sql<string>`SUM(ABS(COALESCE(${positions.absNotional}, 0)))`,
      })
      .from(positions)
      .innerJoin(accounts, eq(positions.accountId, accounts.id))
      .where(
        and(
          inArray(positions.strategyId, strategyIds),
          sql`${positions.quantity} != 0`
        )
      )
      .groupBy(positions.strategyId, accounts.label, accounts.brokerAccountId);

    positionAccountRows.forEach(row => {
      if (row.strategyId) {
        // Prefer label, fallback to broker account ID
        const accountDisplay = row.accountLabel || row.brokerAccountId;
        if (accountDisplay) {
          if (!positionAccountsByStrategy.has(row.strategyId)) {
            positionAccountsByStrategy.set(row.strategyId, []);
          }
          const accountEntries = positionAccountsByStrategy.get(row.strategyId)!;
          // Check if this account is already added
          if (!accountEntries.some(e => e.label === accountDisplay)) {
            accountEntries.push({
              label: accountDisplay,
              absNotional: toNumber(row.totalAbsNotional) ?? 0,
            });
          }
        }
      }
    });

    // Sort accounts by descending abs notional within each strategy
    positionAccountsByStrategy.forEach((accounts, strategyId) => {
      accounts.sort((a, b) => b.absNotional - a.absNotional);
    });
  }

  // Map rows with computed status and optionally filter
  // Standard status values: draft, active, complete, rejected, merged
  const strategiesWithStatus = rows
    .map((row) => {
      // Status computation:
      // - draft, rejected, merged, manually closed (closedAt) → trust DB
      // - active → check positions; if none remain, downgrade to complete
      // - complete → trust DB (don't override to active for dust positions)
      const dbStatus = row.status;
      const computedStatus =
        dbStatus === "draft" || dbStatus === "rejected" || dbStatus === "merged" || row.closedAt
          ? dbStatus
          : dbStatus === "active"
            ? (statusByStrategy.get(row.id) ?? "complete")
            : dbStatus;
      const metrics = metricsByStrategy.get(row.id);
      // Get position-derived account labels (already sorted by desc abs notional)
      const posAccountEntries = positionAccountsByStrategy.get(row.id) ?? [];
      const posAccountLabels = posAccountEntries.map(e => e.label);
      // If no position accounts found, use strategy-level account as fallback (prefer label)
      const fallbackAccountLabel = row.accountLabel || row.accountBrokerId;
      const fallbackAccountLabels = fallbackAccountLabel ? [fallbackAccountLabel] : [];
      return {
        id: row.id,
        strategyKey: row.strategyKey,
        label: row.label ?? row.strategyKey,
        status: computedStatus,
        openedAt: row.openedAt,
        closedAt: row.closedAt,
        accountLabel: row.accountLabel,
        accountBrokerId: row.accountBrokerId,
        latestAbsNotional: metrics?.totalAbsNotional ?? null,
        latestUnrealized: metrics?.totalUnrealizedPnl ?? null,
        latestPctNav: metrics?.pctNavAbsNotional ?? null,
        strategyType: row.strategyType,
        assetThesisId: row.assetThesisId,
        assetViewTitle: row.assetViewTitle,
        linkedMacroTheses: row.assetThesisId
          ? macroThesesByAssetThesis.get(row.assetThesisId) ?? []
          : [],
        positionAccountIds: posAccountLabels.length > 0 ? posAccountLabels : fallbackAccountLabels,
      };
    })
    // Default: show active and draft strategies (draft needs attention for confirmation/merge)
    // With includeClosedStrategies: show all including complete and rejected
    .filter((s) => filters?.includeClosedStrategies ? true : (s.status === "active" || s.status === "draft"))
    .slice(0, limit);

  return strategiesWithStatus;
}

export interface StrategyDetail {
  strategy: {
    id: string;
    strategyKey: string;
    label: string | null;
    status: string;
    openedAt: Date | null;
    closedAt: Date | null;
    accountLabel: string | null;
    accountBrokerId: string | null;
    underlyingTicker: string | null;
    templateLabel: string | null;
    strategyType: string | null;
    direction: string | null;
    assetThesisId: string | null;
    assetViewTitle: string | null;
    linkedMacroTheses: Array<{ id: string; title: string }>;
  };
  metricsTimeline: {
    snapshotDate: string;
    totalAbsNotional: number | null;
    totalUnrealizedPnl: number | null;
    pctNavAbsNotional: number | null;
    numOpenPositions: number | null;
    minDte: number | null;
    maxDte: number | null;
  }[];
  openPositions: {
    id: string;
    symbol: string;
    assetClass: string | null;
    expiry: string | null;
    strike: number | null;
    optionRight: string | null;
    quantity: number;
    absNotional: number | null;
    unrealizedPnl: number | null;
    snapshotDate: string | null;
  }[];
  triageFlags: {
    id: string;
    severity: string | null;
    recommendedAction: string | null;
    snapshotDate: string;
    dte: number | null;
    symbol: string;
    pctNavAbsNotional: number | null;
  }[];
  recentTrades: {
    id: string;
    tradeDate: Date;
    side: string;
    quantity: number;
    price: number;
    symbol: string;
    grossAmount: number | null;
  }[];
  // Note: blotter property removed - action history now in journal_entries
}

export async function getStrategyDetail(strategyId: string): Promise<StrategyDetail | null> {
  try {
    const strategyRows = await db
      .select({
        id: strategies.id,
        strategyKey: strategies.strategyKey,
        label: strategies.autoDerivedLabel,
        status: strategies.status,
        openedAt: strategies.openedAt,
        closedAt: strategies.closedAt,
        accountLabel: accounts.label,
        accountBrokerId: accounts.brokerAccountId,
        templateLabel: strategyTemplates.label,
        underlyingTicker: underlyings.ticker,
        strategyType: strategies.strategyType,
        direction: strategies.direction,
        assetThesisId: strategies.assetThesisId,
        assetViewTitle: assetTheses.title,
      })
      .from(strategies)
      .leftJoin(accounts, eq(strategies.accountId, accounts.id))
      .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
      .leftJoin(underlyings, eq(strategyTemplates.underlyingId, underlyings.id))
      .leftJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
      .where(eq(strategies.id, strategyId))
      .limit(1);

    const strategyRow = strategyRows[0];
    if (!strategyRow) {
      return null;
    }

    // Get linked macro theses via junction table
    let linkedMacroTheses: Array<{ id: string; title: string }> = [];
    if (strategyRow.assetThesisId) {
      const macroThesisRows = await db
        .select({
          id: macroTheses.id,
          title: macroTheses.title,
        })
        .from(assetThesisRelatedMacroTheses)
        .innerJoin(macroTheses, eq(assetThesisRelatedMacroTheses.macroThesisId, macroTheses.id))
        .where(eq(assetThesisRelatedMacroTheses.assetThesisId, strategyRow.assetThesisId));

      linkedMacroTheses = macroThesisRows;
    }

    const metricsTimelineRows = await db
    .select({
      snapshotDate: strategyMetricsSnapshots.snapshotDate,
      totalAbsNotional: strategyMetricsSnapshots.totalAbsNotional,
      totalUnrealizedPnl: strategyMetricsSnapshots.totalUnrealizedPnl,
      pctNavAbsNotional: strategyMetricsSnapshots.pctNavAbsNotional,
      numOpenPositions: strategyMetricsSnapshots.numOpenPositions,
      minDte: strategyMetricsSnapshots.minDte,
      maxDte: strategyMetricsSnapshots.maxDte,
    })
    .from(strategyMetricsSnapshots)
    .where(eq(strategyMetricsSnapshots.strategyId, strategyId))
    .orderBy(asc(strategyMetricsSnapshots.snapshotDate));

    const metricsTimeline = metricsTimelineRows.map((row) => ({
    snapshotDate: row.snapshotDate,
    totalAbsNotional: toNumber(row.totalAbsNotional),
    totalUnrealizedPnl: toNumber(row.totalUnrealizedPnl),
    pctNavAbsNotional: toNumber(row.pctNavAbsNotional),
    numOpenPositions: row.numOpenPositions ?? null,
    minDte: row.minDte ?? null,
    maxDte: row.maxDte ?? null,
  }));

    // Get latest snapshot date for this strategy
    const latestSnapshotResult = await db
    .select({
      snapshotDate: positions.snapshotDate,
    })
    .from(positions)
    .where(
      and(
        eq(positions.strategyId, strategyId),
        sql`${positions.quantity} != 0`
      )
    )
    .orderBy(desc(positions.snapshotDate))
    .limit(1);

    const latestSnapshotDate = latestSnapshotResult[0]?.snapshotDate ?? null;

    const openPositionsRows = latestSnapshotDate
    ? await db
        .select({
          id: positions.id,
          symbol: positions.symbol,
          assetClass: positions.assetClass,
          expiry: positions.expiry,
          strike: positions.strike,
          optionRight: positions.optionRight,
          quantity: positions.quantity,
          absNotional: positions.absNotional,
          unrealizedPnl: positions.unrealizedPnl,
          snapshotDate: positions.snapshotDate,
        })
        .from(positions)
        .where(
          and(
            eq(positions.strategyId, strategyId),
            eq(positions.snapshotDate, latestSnapshotDate),
            sql`${positions.quantity} != 0`
          )
        )
        .orderBy(desc(positions.symbol))
    : [];

    const openPositions = openPositionsRows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    assetClass: row.assetClass,
    expiry: row.expiry,
    strike: toNumber(row.strike),
    optionRight: row.optionRight,
    quantity: Number(row.quantity),
    absNotional: toNumber(row.absNotional),
    unrealizedPnl: toNumber(row.unrealizedPnl),
    snapshotDate: row.snapshotDate,
  }));

    const triageRows = await db
    .select({
      id: triageRecords.id,
      severity: triageRecords.severity,
      recommendedAction: triageRecords.recommendedAction,
      snapshotDate: triageRecords.snapshotDate,
      dte: triageRecords.dte,
      symbol: triageRecords.symbol,
      pctNavAbsNotional: triageRecords.pctNavAbsNotional,
    })
    .from(triageRecords)
    .where(eq(triageRecords.strategyId, strategyId))
    .orderBy(desc(triageRecords.snapshotDate))
    .limit(25);

    const triageFlags = triageRows.map((row) => ({
    id: row.id,
    severity: row.severity,
    recommendedAction: row.recommendedAction,
    snapshotDate: row.snapshotDate,
    dte: row.dte,
    symbol: row.symbol,
    pctNavAbsNotional: toNumber(row.pctNavAbsNotional),
  }));

    // Fetch recent trades for performance page display
    const tradesRows = await db
    .select({
      id: trades.id,
      tradeDate: trades.tradeDate,
      side: trades.side,
      quantity: trades.quantity,
      price: trades.price,
      symbol: trades.symbol,
      grossAmount: trades.grossAmount,
    })
    .from(trades)
    .where(eq(trades.strategyId, strategyId))
    .orderBy(desc(trades.tradeDate))
    .limit(25);

    const recentTrades = tradesRows.map((row) => ({
    id: row.id,
    tradeDate: row.tradeDate,
    side: row.side,
    quantity: Number(row.quantity),
    price: Number(row.price),
    symbol: row.symbol,
    grossAmount: toNumber(row.grossAmount),
  }));

    // Note: blotter table has been deprecated and removed
    // Action history is now available via journal_entries table

    return {
      strategy: {
        id: strategyRow.id,
        strategyKey: strategyRow.strategyKey,
        label: strategyRow.label,
        status: strategyRow.status,
        openedAt: strategyRow.openedAt,
        closedAt: strategyRow.closedAt,
        accountLabel: strategyRow.accountLabel,
        accountBrokerId: strategyRow.accountBrokerId,
        underlyingTicker: strategyRow.underlyingTicker,
        templateLabel: strategyRow.templateLabel,
        strategyType: strategyRow.strategyType,
        direction: strategyRow.direction,
        assetThesisId: strategyRow.assetThesisId,
        assetViewTitle: strategyRow.assetViewTitle,
        linkedMacroTheses,
      },
      metricsTimeline,
      openPositions,
      triageFlags,
      recentTrades,
    };
  } catch (error) {
    // Extract detailed error information for better debugging
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
      // Include postgres error details if available
      const pgError = error as any;
      const details: string[] = [];
      if (pgError.code) details.push(`code: ${pgError.code}`);
      if (pgError.detail) details.push(`detail: ${pgError.detail}`);
      if (pgError.hint) details.push(`hint: ${pgError.hint}`);
      if (details.length > 0) {
        errorMessage = `${errorMessage} (${details.join(', ')})`;
      }
    }
    
    console.error(`Failed to fetch strategy detail for ${strategyId}:`, errorMessage);
    throw new Error(`Failed to fetch strategy detail: ${errorMessage}`);
  }
}

