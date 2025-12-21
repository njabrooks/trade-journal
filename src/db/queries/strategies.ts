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
  assetViews,
  blotterActions,
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
import { getPlaybookItemByCode } from "@/db/queries/playbook";

export interface StrategyListItem {
  id: string;
  strategyKey: string;
  label: string | null;
  status: string;
  openedAt: Date | null;
  accountLabel: string | null;
  accountBrokerId: string | null;
  latestAbsNotional: number | null;
  latestUnrealized: number | null;
  latestPctNav: number | null;
  stateCode: string | null;
  strategyType: string | null;
  macroThesisId: string | null;
  macroThesisTitle: string | null;
  assetViewId: string | null;
  assetViewTitle: string | null;
}

export async function getStrategiesForList(
  limit = 40,
  filters?: {
    macroThesisId?: string;
    assetViewId?: string;
  }
): Promise<StrategyListItem[]> {
  // Get the most recent snapshot date from positions
  const latestSnapshotResult = await db
    .select({
      snapshotDate: positions.snapshotDate,
    })
    .from(positions)
    .where(sql`${positions.quantity} != 0`)
    .orderBy(desc(positions.snapshotDate))
    .limit(1);

  const latestSnapshotDate = latestSnapshotResult[0]?.snapshotDate ?? null;

  // Build where clause based on filters
  const whereConditions = [];
  if (filters?.macroThesisId) {
    whereConditions.push(eq(strategies.macroThesisId, filters.macroThesisId));
  }
  if (filters?.assetViewId) {
    whereConditions.push(eq(strategies.assetViewId, filters.assetViewId));
  }

  // Get all strategies with account info
  let query = db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      label: strategies.autoDerivedLabel,
      status: strategies.status,
      openedAt: strategies.openedAt,
      accountId: strategies.accountId,
      accountLabel: accounts.label,
      accountBrokerId: accounts.brokerAccountId,
      strategyType: strategies.strategyType,
      macroThesisId: strategies.macroThesisId,
      macroThesisTitle: macroTheses.title,
      assetViewId: strategies.assetViewId,
      assetViewTitle: assetViews.title,
    })
    .from(strategies)
    .leftJoin(accounts, eq(strategies.accountId, accounts.id))
    .leftJoin(macroTheses, eq(strategies.macroThesisId, macroTheses.id))
    .leftJoin(assetViews, eq(strategies.assetViewId, assetViews.id))
    .$dynamic();

  if (whereConditions.length > 0) {
    query = query.where(and(...whereConditions));
  }

  const rows = await query
    .orderBy(desc(strategies.openedAt))
    .limit(limit * 2); // Get more to filter after determining status

  const strategyIds = rows.map((row) => row.id);

  // Get latest metrics for all strategies from snapshots
  const metricsByStrategy = new Map<
    string,
    {
      totalAbsNotional: number | null;
      totalUnrealizedPnl: number | null;
      pctNavAbsNotional: number | null;
      stateCode: string | null;
    }
  >();

  if (strategyIds.length > 0) {
    const metricsRows = await db
      .select({
        strategyId: strategyMetricsSnapshots.strategyId,
        snapshotDate: strategyMetricsSnapshots.snapshotDate,
        totalAbsNotional: strategyMetricsSnapshots.totalAbsNotional,
        totalUnrealizedPnl: strategyMetricsSnapshots.totalUnrealizedPnl,
        pctNavAbsNotional: strategyMetricsSnapshots.pctNavAbsNotional,
        stateCode: strategyMetricsSnapshots.stateCode,
      })
      .from(strategyMetricsSnapshots)
      .where(inArray(strategyMetricsSnapshots.strategyId, strategyIds))
      .orderBy(desc(strategyMetricsSnapshots.snapshotDate));

    for (const row of metricsRows) {
      if (!metricsByStrategy.has(row.strategyId)) {
        metricsByStrategy.set(row.strategyId, {
          totalAbsNotional: toNumber(row.totalAbsNotional),
          totalUnrealizedPnl: toNumber(row.totalUnrealizedPnl),
          pctNavAbsNotional: toNumber(row.pctNavAbsNotional),
          stateCode: row.stateCode,
        });
      }
    }
  }


  // Determine actual status based on positions for latest snapshot date
  const statusByStrategy = new Map<string, "open" | "closed">();
  if (latestSnapshotDate && strategyIds.length > 0) {
    const positionRows = await db
      .select({
        strategyId: positions.strategyId,
      })
      .from(positions)
      .where(
        and(
          inArray(positions.strategyId, strategyIds),
          eq(positions.snapshotDate, latestSnapshotDate),
          sql`${positions.quantity} != 0`
        )
      )
      .groupBy(positions.strategyId);

    for (const row of positionRows) {
      if (row.strategyId) {
        statusByStrategy.set(row.strategyId, "open");
      }
    }
  }

  // Map rows with computed status and filter to open only
  const strategiesWithStatus = rows
    .map((row) => {
      const computedStatus = statusByStrategy.get(row.id) ?? "closed";
      const metrics = metricsByStrategy.get(row.id);
      return {
        id: row.id,
        strategyKey: row.strategyKey,
        label: row.label ?? row.strategyKey,
        status: computedStatus,
        openedAt: row.openedAt,
        accountLabel: row.accountLabel,
        accountBrokerId: row.accountBrokerId,
        latestAbsNotional: metrics?.totalAbsNotional ?? null,
        latestUnrealized: metrics?.totalUnrealizedPnl ?? null,
        latestPctNav: metrics?.pctNavAbsNotional ?? null,
        stateCode: metrics?.stateCode ?? null,
        strategyType: row.strategyType,
        macroThesisId: row.macroThesisId,
        macroThesisTitle: row.macroThesisTitle,
        assetViewId: row.assetViewId,
        assetViewTitle: row.assetViewTitle,
      };
    })
    .filter((s) => s.status === "open")
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
    thesis: string | null;
    profitRules: string | null;
    defenseRules: string | null;
    timeRules: string | null;
    exitCriteria: string | null;
    accountLabel: string | null;
    accountBrokerId: string | null;
    underlyingTicker: string | null;
    templateLabel: string | null;
    strategyType: string | null;
    macroThesisId: string | null;
    macroThesisTitle: string | null;
    assetViewId: string | null;
    assetViewTitle: string | null;
  };
  currentStateCode: string | null;
  currentPlaybookItem: {
    code: string;
    label: string;
    description: string | null;
    category: string;
    checklistItems: Array<{ order: number; type: string; text: string }> | null;
  } | null;
  metricsTimeline: {
    snapshotDate: string;
    totalAbsNotional: number | null;
    totalUnrealizedPnl: number | null;
    pctNavAbsNotional: number | null;
    numOpenPositions: number | null;
    minDte: number | null;
    maxDte: number | null;
    stateCode: string | null;
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
  blotter: {
    id: string;
    actionDate: string;
    reasonCode: string | null;
    actionClass: string | null;
    actionDetail: string | null;
    premiumChange: number | null;
    realizedPnl: number | null;
  }[];
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
        thesis: strategies.thesis,
        profitRules: strategies.profitRules,
        defenseRules: strategies.defenseRules,
        timeRules: strategies.timeRules,
        exitCriteria: strategies.exitCriteria,
        accountLabel: accounts.label,
        accountBrokerId: accounts.brokerAccountId,
        templateLabel: strategyTemplates.label,
        underlyingTicker: underlyings.ticker,
        strategyType: strategies.strategyType,
        macroThesisId: strategies.macroThesisId,
        macroThesisTitle: macroTheses.title,
        assetViewId: strategies.assetViewId,
        assetViewTitle: assetViews.title,
      })
      .from(strategies)
      .leftJoin(accounts, eq(strategies.accountId, accounts.id))
      .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
      .leftJoin(underlyings, eq(strategyTemplates.underlyingId, underlyings.id))
      .leftJoin(macroTheses, eq(strategies.macroThesisId, macroTheses.id))
      .leftJoin(assetViews, eq(strategies.assetViewId, assetViews.id))
      .where(eq(strategies.id, strategyId))
      .limit(1);

    const strategyRow = strategyRows[0];
    if (!strategyRow) {
      return null;
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
      stateCode: strategyMetricsSnapshots.stateCode,
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
    stateCode: row.stateCode,
  }));

    // Get current state code from latest metrics
    const latestMetrics = metricsTimelineRows[metricsTimelineRows.length - 1];
    const currentStateCode = latestMetrics?.stateCode ?? null;

    // Get playbook item for current state code
    let currentPlaybookItem = null;
    if (currentStateCode) {
      const playbookItem = await getPlaybookItemByCode(currentStateCode);
      if (playbookItem) {
        currentPlaybookItem = {
          code: playbookItem.code,
          label: playbookItem.label,
          description: playbookItem.description,
          category: playbookItem.category,
          checklistItems: playbookItem.checklistItems,
        };
      }
    }

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

    const blotterRows = await db
    .select({
      id: blotterActions.id,
      actionDate: blotterActions.actionDate,
      reasonCode: blotterActions.reasonCode,
      actionClass: blotterActions.actionClass,
      actionDetail: blotterActions.actionDetail,
      premiumChange: blotterActions.premiumChange,
      realizedPnl: blotterActions.realizedPnl,
    })
    .from(blotterActions)
    .where(eq(blotterActions.strategyId, strategyId))
    .orderBy(desc(blotterActions.actionDate))
    .limit(20);

    const blotter = blotterRows.map((row) => ({
    id: row.id,
    actionDate: row.actionDate,
    reasonCode: row.reasonCode,
    actionClass: row.actionClass,
    actionDetail: row.actionDetail,
    premiumChange: toNumber(row.premiumChange),
    realizedPnl: toNumber(row.realizedPnl),
  }));

    return {
      strategy: {
        id: strategyRow.id,
        strategyKey: strategyRow.strategyKey,
        label: strategyRow.label,
        status: strategyRow.status,
        openedAt: strategyRow.openedAt,
        closedAt: strategyRow.closedAt,
        thesis: strategyRow.thesis,
        profitRules: strategyRow.profitRules,
        defenseRules: strategyRow.defenseRules,
        timeRules: strategyRow.timeRules,
        exitCriteria: strategyRow.exitCriteria,
        accountLabel: strategyRow.accountLabel,
        accountBrokerId: strategyRow.accountBrokerId,
        underlyingTicker: strategyRow.underlyingTicker,
        templateLabel: strategyRow.templateLabel,
        strategyType: strategyRow.strategyType,
        macroThesisId: strategyRow.macroThesisId,
        macroThesisTitle: strategyRow.macroThesisTitle,
        assetViewId: strategyRow.assetViewId,
        assetViewTitle: strategyRow.assetViewTitle,
      },
      currentStateCode,
      currentPlaybookItem,
      metricsTimeline,
      openPositions,
      triageFlags,
      recentTrades,
      blotter,
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

