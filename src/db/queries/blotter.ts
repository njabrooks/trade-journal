import { and, desc, asc, eq, sql, inArray, isNull, isNotNull, or, ne } from "drizzle-orm";
import { db } from "@/db";
import { blotterActions, strategies, trades, positions } from "@/db/schema";
import { toNumber } from "@/lib/numbers";

export interface BlotterFilters {
  source?: string[];
  actionClass?: string[];
  status?: string[];
  strategyKey?: string[];
  followUp?: string[];
  sort?: string;
  direction?: "asc" | "desc";
}

export interface BlotterEntry {
  id: string;
  actionDate: string;
  createdAt: string | null;
  strategyId: string | null;
  strategyKey: string | null;
  actionClass: string | null;
  actionDetail: string | null;
  reasonCode: string | null;
  legScope: string | null;
  qtyChange: number | null;
  premiumChange: number | null;
  realizedPnl: number | null;
  followUpRequired: boolean | null;
  followUpDate: string | null;
  completed: boolean | null;
  source: string | null;
  tradeCount: number | null;
  tradeIds: string[] | null;
  conid: number | null;
  linkedBlotterActionId: string | null;
  linkedTradeBlotterIds: string[] | null; // Array of linked trade blotter entry IDs (for QUANTITY_CHANGE with multiple positions)
  // Linked metadata (from triage action when linked)
  linkedTradeReason: string | null;
  linkedTradeStage: string | null;
  linkedNotes: string | null;
  linkedCreatedAt: string | null;
  // Multiple linked trade entries (for QUANTITY_CHANGE with multiple positions)
  linkedTradeEntries: Array<{
    id: string;
    ticker: string | null;
    qtyChange: number | null;
    premiumChange: number | null;
  }> | null;
  // MONITOR/DISMISS fields
  notes: string | null;
  severityOverride: string | null;
  monitorDays: number | null;
  overrideExpiresDate: string | null;
  ticker: string | null;
  // Trade action fields (stored directly on triage actions)
  tradeStage: string | null;
  tradeReason: string | null;
  // Enhanced trade and position details
  tradeDetails: Array<{
    id: string;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    grossAmount: number | null;
    netAmount: number | null;
    fees: number | null;
    assetClass: string | null;
    exchange: string | null;
    orderType: string | null;
    currency: string | null;
    tradeDate: string;
  }> | null;
  positionDetails: {
    symbol: string;
    assetClass: string | null;
    expiry: string | null;
    strike: number | null;
    optionRight: string | null;
    quantity: number | null;
  } | null;
  parsedNotes: {
    text?: string;
    tradeDetails?: any;
  } | null;
}

export async function getBlotterEntries(
  accountId: string | null,
  filters: BlotterFilters = {},
  limit?: number
): Promise<BlotterEntry[]> {
  const conditions = [];

  if (accountId) {
    conditions.push(eq(strategies.accountId, accountId));
  }

  // Source filter (array)
  if (filters.source && filters.source.length > 0) {
    conditions.push(inArray(blotterActions.source, filters.source));
  }

  // Action class filter (array)
  if (filters.actionClass && filters.actionClass.length > 0) {
    conditions.push(inArray(blotterActions.actionClass, filters.actionClass));
  }

  // Status filter: matched, unmatched, pending
  if (filters.status && filters.status.length > 0) {
    const statusConditions = [];
    for (const status of filters.status) {
      if (status === "matched") {
        statusConditions.push(
          or(
            isNotNull(blotterActions.linkedBlotterActionId),
            isNotNull(blotterActions.linkedTradeBlotterIds)
          )
        );
      } else if (status === "unmatched") {
        statusConditions.push(
          and(
            eq(blotterActions.source, 'trade_ingestion'),
            isNull(blotterActions.linkedBlotterActionId),
            isNull(blotterActions.linkedTradeBlotterIds)
          )
        );
      } else if (status === "pending") {
        statusConditions.push(
          and(
            eq(blotterActions.followUpRequired, true),
            eq(blotterActions.completed, false)
          )
        );
      }
    }
    if (statusConditions.length > 0) {
      conditions.push(or(...statusConditions));
    }
  }

  // Strategy filter (array)
  if (filters.strategyKey && filters.strategyKey.length > 0) {
    conditions.push(inArray(strategies.strategyKey, filters.strategyKey));
  }

  // Follow-up filter (array)
  if (filters.followUp && filters.followUp.length > 0) {
    const followUpConditions = [];
    for (const followUp of filters.followUp) {
      if (followUp === "pending") {
        followUpConditions.push(
          and(
            eq(blotterActions.followUpRequired, true),
            eq(blotterActions.completed, false)
          )
        );
      } else if (followUp === "completed") {
        followUpConditions.push(eq(blotterActions.completed, true));
      } else if (followUp === "none") {
        followUpConditions.push(
          or(
            isNull(blotterActions.followUpRequired),
            eq(blotterActions.followUpRequired, false)
          )
        );
      }
    }
    if (followUpConditions.length > 0) {
      conditions.push(or(...followUpConditions));
    }
  }

  // Build base query
  const baseQuery = db
    .select({
      id: blotterActions.id,
      actionDate: blotterActions.actionDate,
      createdAt: blotterActions.createdAt,
      strategyId: blotterActions.strategyId,
      strategyKey: strategies.strategyKey,
      actionClass: blotterActions.actionClass,
      actionDetail: blotterActions.actionDetail,
      reasonCode: blotterActions.reasonCode,
      legScope: blotterActions.legScope,
      qtyChange: blotterActions.qtyChange,
      premiumChange: blotterActions.premiumChange,
      realizedPnl: blotterActions.realizedPnl,
      followUpRequired: blotterActions.followUpRequired,
      followUpDate: blotterActions.followUpDate,
      completed: blotterActions.completed,
      source: blotterActions.source,
      tradeCount: blotterActions.tradeCount,
      tradeIds: blotterActions.tradeIds,
      conid: sql<number | null>`${blotterActions.conid}::bigint`.as('conid'),
      linkedBlotterActionId: blotterActions.linkedBlotterActionId,
      linkedTradeBlotterIds: blotterActions.linkedTradeBlotterIds,
      notes: blotterActions.notes,
      severityOverride: blotterActions.severityOverride,
      monitorDays: blotterActions.monitorDays,
      overrideExpiresDate: blotterActions.overrideExpiresDate,
      ticker: blotterActions.ticker,
      tradeStage: blotterActions.tradeStage,
      tradeReason: blotterActions.tradeReason,
    })
    .from(blotterActions)
    .leftJoin(strategies, eq(blotterActions.strategyId, strategies.id));

  // Apply where conditions and build query
  const queryWithWhere = conditions.length > 0 
    ? baseQuery.where(and(...conditions))
    : baseQuery;

  // Sorting
  const sortColumn = filters.sort;
  const sortDirection = filters.direction || "desc";
  
  let queryWithOrder: any;
  if (sortColumn === "createdAt") {
    queryWithOrder = queryWithWhere.orderBy(sortDirection === "asc" ? asc(blotterActions.createdAt) : desc(blotterActions.createdAt));
  } else if (sortColumn === "actionDate") {
    queryWithOrder = queryWithWhere.orderBy(sortDirection === "asc" ? asc(blotterActions.actionDate) : desc(blotterActions.actionDate));
  } else if (sortColumn === "strategyKey") {
    queryWithOrder = queryWithWhere.orderBy(sortDirection === "asc" ? asc(strategies.strategyKey) : desc(strategies.strategyKey));
  } else if (sortColumn === "actionClass") {
    queryWithOrder = queryWithWhere.orderBy(sortDirection === "asc" ? asc(blotterActions.actionClass) : desc(blotterActions.actionClass));
  } else if (sortColumn === "premiumChange") {
    queryWithOrder = queryWithWhere.orderBy(sortDirection === "asc" ? asc(blotterActions.premiumChange) : desc(blotterActions.premiumChange));
  } else if (sortColumn === "qtyChange") {
    queryWithOrder = queryWithWhere.orderBy(sortDirection === "asc" ? asc(blotterActions.qtyChange) : desc(blotterActions.qtyChange));
  } else {
    // Default: sort by createdAt desc
    queryWithOrder = queryWithWhere.orderBy(desc(blotterActions.createdAt));
  }
  
  // Apply limit if specified
  const finalQuery = limit !== undefined && limit > 0
    ? queryWithOrder.limit(limit)
    : queryWithOrder;

  const rows = await finalQuery;

  // Collect all trade IDs and conids for batch fetching
  const allTradeIds = new Set<string>();
  const allConids = new Set<number>();
  
  rows.forEach((r: typeof rows[0]) => {
    if (r.tradeIds && Array.isArray(r.tradeIds)) {
      r.tradeIds.forEach((id: string) => allTradeIds.add(id));
    }
    if (r.conid) {
      allConids.add(r.conid);
    }
  });

  // Fetch trade details
  const tradeDetailsMap = new Map<string, Array<{
    id: string;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    grossAmount: number | null;
    netAmount: number | null;
    fees: number | null;
    assetClass: string | null;
    exchange: string | null;
    orderType: string | null;
    currency: string | null;
    tradeDate: string;
  }>>();

  if (allTradeIds.size > 0) {
    const tradeRows = await db
      .select({
        id: trades.id,
        symbol: trades.symbol,
        side: trades.side,
        quantity: trades.quantity,
        price: trades.price,
        grossAmount: trades.grossAmount,
        netAmount: trades.netAmount,
        fees: trades.fees,
        assetClass: trades.assetClass,
        exchange: trades.exchange,
        orderType: trades.orderType,
        currency: trades.currency,
        tradeDate: trades.tradeDate,
      })
      .from(trades)
      .where(inArray(trades.id, Array.from(allTradeIds)));

    // Group trades by blotter entry (via tradeIds array)
    rows.forEach((r: typeof rows[0]) => {
      if (r.tradeIds && Array.isArray(r.tradeIds) && r.tradeIds.length > 0) {
        const entryTrades = tradeRows
          .filter((t) => (r.tradeIds as string[]).includes(t.id))
          .map((t) => ({
            id: t.id,
            symbol: t.symbol,
            side: t.side,
            quantity: toNumber(t.quantity) || 0,
            price: toNumber(t.price) || 0,
            grossAmount: toNumber(t.grossAmount),
            netAmount: toNumber(t.netAmount),
            fees: toNumber(t.fees),
            assetClass: t.assetClass ?? null,
            exchange: t.exchange ?? null,
            orderType: t.orderType ?? null,
            currency: t.currency ?? null,
            tradeDate: t.tradeDate.toISOString(),
          }));
        if (entryTrades.length > 0) {
          tradeDetailsMap.set(r.id, entryTrades);
        }
      }
    });
  }

  // Fetch position details
  const positionDetailsMap = new Map<number, {
    symbol: string;
    assetClass: string | null;
    expiry: string | null;
    strike: number | null;
    optionRight: string | null;
    quantity: number | null;
  }>();

  if (allConids.size > 0) {
    // Get the most recent position for each conid
    const positionRows = await db
      .select({
        conid: positions.conid,
        symbol: positions.symbol,
        assetClass: positions.assetClass,
        expiry: positions.expiry,
        strike: positions.strike,
        optionRight: positions.optionRight,
        quantity: positions.quantity,
        snapshotDate: positions.snapshotDate,
      })
      .from(positions)
      .where(inArray(positions.conid, Array.from(allConids)));

    // Sort by snapshotDate descending to get most recent first, then group by conid
    positionRows.sort((a, b) => {
      if (!a.snapshotDate || !b.snapshotDate) return 0;
      return new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime();
    });

    // Group by conid and take the most recent (first after sorting)
    const conidMap = new Map<number, typeof positionRows[0]>();
    positionRows.forEach((p) => {
      if (p.conid && !conidMap.has(p.conid)) {
        conidMap.set(p.conid, p);
      }
    });

    conidMap.forEach((pos, conid) => {
      positionDetailsMap.set(conid, {
        symbol: pos.symbol,
        assetClass: pos.assetClass ?? null,
        expiry: pos.expiry ?? null,
        strike: pos.strike ? toNumber(pos.strike) : null,
        optionRight: pos.optionRight ?? null,
        quantity: pos.quantity ? toNumber(pos.quantity) : null,
      });
    });
  }

  // Helper to parse notes JSON
  function parseNotes(notes: string | null): { text?: string; tradeDetails?: any } | null {
    if (!notes) return null;
    try {
      const parsed = JSON.parse(notes);
      return typeof parsed === 'object' ? parsed : { text: notes };
    } catch {
      return { text: notes };
    }
  }

  // Fetch linked entry metadata for entries that have linkedBlotterActionId
  // Also collect all linkedTradeBlotterIds for QUANTITY_CHANGE records
  const linkedIds = new Set<string>();
  rows.forEach((r: typeof rows[0]) => {
    if (r.linkedBlotterActionId) {
      linkedIds.add(r.linkedBlotterActionId);
    }
    // Also add all linked trade blotter IDs from the array
    if (r.linkedTradeBlotterIds && Array.isArray(r.linkedTradeBlotterIds)) {
      r.linkedTradeBlotterIds.forEach((id: string) => linkedIds.add(id));
    }
  });
  
  const linkedEntriesMap = new Map<string, {
    tradeReason: string | null;
    tradeStage: string | null;
    notes: string | null;
    createdAt: Date | null;
    ticker: string | null;
    qtyChange: number | null;
    premiumChange: number | null;
  }>();

  if (linkedIds.size > 0) {
    const linkedRows = await db
      .select({
        id: blotterActions.id,
        tradeReason: blotterActions.tradeReason,
        tradeStage: blotterActions.tradeStage,
        notes: blotterActions.notes,
        createdAt: blotterActions.createdAt,
        ticker: blotterActions.ticker,
        qtyChange: blotterActions.qtyChange,
        premiumChange: blotterActions.premiumChange,
      })
      .from(blotterActions)
      .where(inArray(blotterActions.id, Array.from(linkedIds)));

    for (const linkedRow of linkedRows) {
      linkedEntriesMap.set(linkedRow.id, {
        tradeReason: linkedRow.tradeReason ?? null,
        tradeStage: linkedRow.tradeStage ?? null,
        notes: linkedRow.notes ?? null,
        createdAt: linkedRow.createdAt ?? null,
        ticker: linkedRow.ticker ?? null,
        qtyChange: toNumber(linkedRow.qtyChange),
        premiumChange: toNumber(linkedRow.premiumChange),
      });
    }
  }

  return rows.map((row: typeof rows[0]) => {
    const linkedData = row.linkedBlotterActionId
      ? linkedEntriesMap.get(row.linkedBlotterActionId)
      : null;

    // Build array of all linked trade entries (from linkedTradeBlotterIds)
    const linkedTradeEntries: Array<{
      id: string;
      ticker: string | null;
      qtyChange: number | null;
      premiumChange: number | null;
    }> | null = row.linkedTradeBlotterIds && Array.isArray(row.linkedTradeBlotterIds)
      ? row.linkedTradeBlotterIds
          .map((id: string) => {
            const entry = linkedEntriesMap.get(id);
            return entry
              ? {
                  id,
                  ticker: entry.ticker,
                  qtyChange: entry.qtyChange,
                  premiumChange: entry.premiumChange,
                }
              : null;
          })
          .filter((e: { id: string; ticker: string | null; qtyChange: number | null; premiumChange: number | null } | null): e is NonNullable<typeof e> => e !== null)
      : null;

    return {
    id: row.id,
    actionDate: row.actionDate,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    strategyId: row.strategyId,
    strategyKey: row.strategyKey,
    actionClass: row.actionClass,
    actionDetail: row.actionDetail,
    reasonCode: row.reasonCode,
    legScope: row.legScope,
    qtyChange: toNumber(row.qtyChange),
    premiumChange: toNumber(row.premiumChange),
    realizedPnl: toNumber(row.realizedPnl),
    followUpRequired: row.followUpRequired ?? null,
    followUpDate: row.followUpDate ?? null,
    completed: row.completed ?? null,
      source: row.source ?? 'triage_action',
      tradeCount: row.tradeCount ?? null,
      tradeIds: (row.tradeIds as string[] | null) ?? null,
      conid: row.conid ?? null,
      linkedBlotterActionId: row.linkedBlotterActionId ?? null,
      linkedTradeBlotterIds: (row.linkedTradeBlotterIds as string[] | null) ?? null,
      linkedTradeReason: linkedData?.tradeReason ?? null,
      linkedTradeStage: linkedData?.tradeStage ?? null,
      linkedNotes: linkedData?.notes ?? null,
      linkedCreatedAt: linkedData?.createdAt ? linkedData.createdAt.toISOString() : null,
      linkedTradeEntries,
      notes: row.notes ?? null,
      severityOverride: row.severityOverride ?? null,
      monitorDays: row.monitorDays ?? null,
      overrideExpiresDate: row.overrideExpiresDate ?? null,
      ticker: row.ticker ?? null,
      tradeStage: row.tradeStage ?? null,
      tradeReason: row.tradeReason ?? null,
      tradeDetails: tradeDetailsMap.get(row.id) ?? null,
      positionDetails: row.conid ? positionDetailsMap.get(row.conid) ?? null : null,
      parsedNotes: parseNotes(row.notes),
    };
  });
}


export interface BlotterEntriesCounts {
  source: Record<string, number>;
  actionClass: Record<string, number>;
  status: Record<string, number>;
  strategyKey: Record<string, number>;
  followUp: Record<string, number>;
}

/**
 * Get counts for all blotter filter options using SQL aggregation
 * This replaces the pattern of fetching ALL records just to count them
 */
export async function getBlotterEntriesCounts(
  accountId: string | null
): Promise<BlotterEntriesCounts> {
  const baseConditions = [];
  
  if (accountId) {
    baseConditions.push(eq(strategies.accountId, accountId));
  }

  // Exclude merged strategies
  baseConditions.push(
    or(
      isNull(strategies.status),
      ne(strategies.status, 'merged')
    )
  );

  // Get counts for each dimension using SQL GROUP BY
  const [sourceRows, actionClassRows, strategyRows] = await Promise.all([
    // Source counts
    db
      .select({
        value: blotterActions.source,
        count: sql<number>\`count(*)::int\`,
      })
      .from(blotterActions)
      .leftJoin(strategies, eq(blotterActions.strategyId, strategies.id))
      .where(and(...baseConditions))
      .groupBy(blotterActions.source),

    // Action class counts
    db
      .select({
        value: blotterActions.actionClass,
        count: sql<number>\`count(*)::int\`,
      })
      .from(blotterActions)
      .leftJoin(strategies, eq(blotterActions.strategyId, strategies.id))
      .where(and(...baseConditions))
      .groupBy(blotterActions.actionClass),

    // Strategy key counts
    db
      .select({
        value: strategies.strategyKey,
        count: sql<number>\`count(*)::int\`,
      })
      .from(blotterActions)
      .leftJoin(strategies, eq(blotterActions.strategyId, strategies.id))
      .where(and(...baseConditions, sql\`\${strategies.strategyKey} IS NOT NULL\`))
      .groupBy(strategies.strategyKey),
  ]);

  // Status counts require complex logic, fetch with CASE
  const statusRows = await db
    .select({
      matched: sql<number>\`count(*) FILTER (WHERE \${blotterActions.linkedBlotterActionId} IS NOT NULL OR \${blotterActions.linkedTradeBlotterIds} IS NOT NULL)::int\`,
      unmatched: sql<number>\`count(*) FILTER (WHERE \${blotterActions.source} = 'trade_ingestion' AND \${blotterActions.linkedBlotterActionId} IS NULL AND \${blotterActions.linkedTradeBlotterIds} IS NULL)::int\`,
      pending: sql<number>\`count(*) FILTER (WHERE \${blotterActions.followUpRequired} = true AND \${blotterActions.completed} = false)::int\`,
    })
    .from(blotterActions)
    .leftJoin(strategies, eq(blotterActions.strategyId, strategies.id))
    .where(and(...baseConditions));

  // Follow-up counts
  const followUpRows = await db
    .select({
      pending: sql<number>\`count(*) FILTER (WHERE \${blotterActions.followUpRequired} = true AND \${blotterActions.completed} = false)::int\`,
      completed: sql<number>\`count(*) FILTER (WHERE \${blotterActions.followUpRequired} = true AND \${blotterActions.completed} = true)::int\`,
      none: sql<number>\`count(*) FILTER (WHERE \${blotterActions.followUpRequired} = false OR \${blotterActions.followUpRequired} IS NULL)::int\`,
    })
    .from(blotterActions)
    .leftJoin(strategies, eq(blotterActions.strategyId, strategies.id))
    .where(and(...baseConditions));

  return {
    source: Object.fromEntries(
      sourceRows.map((row) => [row.value ?? '', row.count])
    ),
    actionClass: Object.fromEntries(
      actionClassRows.map((row) => [row.value ?? '', row.count])
    ),
    status: {
      matched: statusRows[0]?.matched ?? 0,
      unmatched: statusRows[0]?.unmatched ?? 0,
      pending: statusRows[0]?.pending ?? 0,
    },
    strategyKey: Object.fromEntries(
      strategyRows.map((row) => [row.value ?? '', row.count])
    ),
    followUp: {
      pending: followUpRows[0]?.pending ?? 0,
      completed: followUpRows[0]?.completed ?? 0,
      none: followUpRows[0]?.none ?? 0,
    },
  };
}
