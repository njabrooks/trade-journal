import { db } from '@/db';
import {
  positions,
  trades,
  strategies,
  strategyTemplates,
  underlyings,
} from '@/db/schema';
import { and, eq, isNull, isNotNull, gte, lte, sql, ne, desc } from 'drizzle-orm';
import { populateStrategyEntryContext } from '@/lib/services/strategies';
import { logToJournal } from '@/lib/workflow/lifecycleDetection';

type DateRangeOptions =
  | { snapshotDate: string; startDate?: never; endDate?: never }
  | { snapshotDate?: never; startDate: string; endDate: string }
  | { snapshotDate?: string; startDate?: string; endDate?: string };

interface PositionMinimal {
  id: string;
  accountId: string;
  symbol: string;
  assetClass: string | null;
  expiry: string | null;
  snapshotDate: string | null;
  openDate: Date | null;
  underlyingId: string | null;
}

interface TradeMinimal {
  id: string;
  accountId: string;
  symbol: string;
  assetClass: string | null;
  tradeDate: Date;
}

function formatExpiry(expiry: string | null): string | null {
  if (!expiry) return null;
  const date = new Date(expiry + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) return null;
  const yy = String(date.getUTCFullYear()).slice(2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

export function deriveStrategyKeyFromPosition(pos: PositionMinimal): string | null {
  if (pos.assetClass === 'STK' || pos.assetClass === 'FUT' || pos.assetClass === 'CFD') {
    return `${pos.symbol}-STK`;
  }

  if (pos.assetClass === 'CRYPTO') {
    return `${pos.symbol}-CRYPTO`;
  }

  if (pos.assetClass === 'PERP') {
    return `${pos.symbol}-PERP`;
  }

  if (pos.assetClass === 'OPT') {
    // For options, extract ticker from symbol and use expiry from position
    // Symbol format is like "IBIT  260918C00060000" where ticker is before the digits
    // Extract ticker: letters only at the start, or up to first space+digit pattern
    const trimmed = pos.symbol.trim();
    // Try to match ticker (letters only) before any digits or spaces+digits
    const tickerMatch = trimmed.match(/^([A-Z]+)(?:\s+\d|\d)/);
    const ticker = tickerMatch ? tickerMatch[1] : trimmed.split(/\s+/)[0].replace(/\d.*$/, '');
    
    if (!ticker || ticker.length === 0) return null;
    
    const expiryCode = formatExpiry(pos.expiry);
    
    if (expiryCode) {
      return `${ticker} ${expiryCode}`;
    }
  }

  return null;
}

export function deriveStrategyLabelFromPosition(pos: PositionMinimal): string | null {
  if (pos.assetClass === 'STK' || pos.assetClass === 'FUT' || pos.assetClass === 'CFD') {
    return `${pos.symbol} Stock`;
  }

  if (pos.assetClass === 'CRYPTO') {
    return `${pos.symbol} Spot`;
  }

  if (pos.assetClass === 'PERP') {
    return `${pos.symbol} Perp`;
  }

  if (pos.assetClass === 'OPT') {
    if (pos.expiry) {
      return `${pos.symbol} ${pos.expiry}`;
    }
  }

  return pos.symbol;
}

function extractTickerAndExpiryFromSymbol(symbol: string): { ticker: string; expiry?: string } {
  const match = symbol.match(/^([A-Z0-9]+)\s+(\d{6})/);
  if (match) {
    return { ticker: match[1], expiry: match[2] };
  }
  return { ticker: symbol.trim() };
}

export function deriveStrategyKeyFromTrade(trade: TradeMinimal): string | null {
  if (trade.assetClass === 'STK' || trade.assetClass === 'FUT' || trade.assetClass === 'CFD') {
    return `${trade.symbol}-STK`;
  }

  if (trade.assetClass === 'CRYPTO') {
    return `${trade.symbol}-CRYPTO`;
  }

  if (trade.assetClass === 'PERP') {
    return `${trade.symbol}-PERP`;
  }

  if (trade.assetClass === 'OPT') {
    const { ticker, expiry } = extractTickerAndExpiryFromSymbol(trade.symbol);
    if (expiry) {
      return `${ticker} ${expiry}`;
    }
    return `${ticker} OPT`;
  }

  return null;
}

export function deriveStrategyLabelFromTrade(trade: TradeMinimal): string | null {
  if (trade.assetClass === 'STK' || trade.assetClass === 'FUT' || trade.assetClass === 'CFD') {
    return `${trade.symbol} Stock`;
  }

  if (trade.assetClass === 'CRYPTO') {
    return `${trade.symbol} Spot`;
  }

  if (trade.assetClass === 'PERP') {
    return `${trade.symbol} Perp`;
  }

  if (trade.assetClass === 'OPT') {
    const { ticker, expiry } = extractTickerAndExpiryFromSymbol(trade.symbol);
    if (expiry) {
      return `${ticker} ${expiry}`;
    }
    return `${ticker} Option`;
  }

  return trade.symbol;
}

const MAX_MERGE_CHAIN_DEPTH = 5;

/**
 * Follows the merged_into_id chain to find the ultimate non-merged strategy.
 * Works cross-account — the target may be on a different account than the source.
 * Returns the final target's { id, status }, or null if the chain is broken.
 */
async function resolveStrategyMergeTarget(
  mergedStrategyId: string
): Promise<{ id: string; status: string } | null> {
  let currentId = mergedStrategyId;

  for (let depth = 0; depth < MAX_MERGE_CHAIN_DEPTH; depth++) {
    const result = await db
      .select({
        id: strategies.id,
        status: strategies.status,
        mergedIntoId: strategies.mergedIntoId,
      })
      .from(strategies)
      .where(eq(strategies.id, currentId))
      .limit(1);

    if (result.length === 0) return null;

    const strategy = result[0];

    // If this strategy is not merged (or has no pointer), it's the target
    if (strategy.status !== 'merged' || !strategy.mergedIntoId) {
      return { id: strategy.id, status: strategy.status };
    }

    // Follow the chain
    currentId = strategy.mergedIntoId;
  }

  console.warn(
    `Merge chain exceeded max depth (${MAX_MERGE_CHAIN_DEPTH}) starting from ${mergedStrategyId}`
  );
  return null;
}

async function ensureStrategyTemplate(
  strategyKey: string,
  label: string,
  underlyingId: string
): Promise<string> {
  const existing = await db
    .select()
    .from(strategyTemplates)
    .where(eq(strategyTemplates.strategyKey, strategyKey))
    .limit(1);

  if (existing.length > 0) {
    // Update label if auto-derived and template label missing
    if (!existing[0].label && label) {
      await db
        .update(strategyTemplates)
        .set({ label, updatedAt: new Date() })
        .where(eq(strategyTemplates.id, existing[0].id));
    }
    return existing[0].id;
  }

  const [created] = await db
    .insert(strategyTemplates)
    .values({
      strategyKey,
      label: label || strategyKey,
      underlyingId,
    })
    .returning();

  return created.id;
}

async function ensureUnderlyingId(
  symbol: string,
  existingId: string | null,
  assetClass?: string | null
): Promise<string | null> {
  if (existingId) return existingId;
  const found = await db.select().from(underlyings).where(eq(underlyings.ticker, symbol)).limit(1);
  if (found.length > 0) {
    return found[0].id;
  }

  const [created] = await db
    .insert(underlyings)
    .values({
      ticker: symbol,
      assetClass: assetClass ?? null,
    })
    .returning();

  return created?.id ?? null;
}

async function findOrCreateStrategyFromPosition(
  pos: PositionMinimal,
  options?: { source?: string }
): Promise<{ id: string; created: boolean } | null> {
  const derivedKey = deriveStrategyKeyFromPosition(pos);
  if (!derivedKey) return null;

  const derivedLabel = deriveStrategyLabelFromPosition(pos);
  const underlyingId = await ensureUnderlyingId(pos.symbol, pos.underlyingId, pos.assetClass);
  if (!underlyingId) return null;

  // Check if this underlying has a parent (e.g., CBBTC -> BTC, JITOSOL -> SOL)
  // If so, we should also consider strategies for the parent underlying
  const underlyingWithParent = await db
    .select({
      parentUnderlyingId: underlyings.parentUnderlyingId,
    })
    .from(underlyings)
    .where(eq(underlyings.id, underlyingId))
    .limit(1);

  let parentKey: string | null = null;
  if (underlyingWithParent[0]?.parentUnderlyingId) {
    const parentUnderlying = await db
      .select({ ticker: underlyings.ticker })
      .from(underlyings)
      .where(eq(underlyings.id, underlyingWithParent[0].parentUnderlyingId))
      .limit(1);
    if (parentUnderlying[0]?.ticker) {
      // Derive the parent strategy key (e.g., BTC-CRYPTO from CBBTC-CRYPTO)
      const assetSuffix = derivedKey.split('-').pop(); // CRYPTO, PERP, STK, etc.
      parentKey = `${parentUnderlying[0].ticker}-${assetSuffix}`;
    }
  }

  // First, check ALL strategies for this account+key to understand the full picture
  // This includes rejected/merged/complete strategies to make informed decisions
  const allStrategiesForKey = await db
    .select({
      id: strategies.id,
      status: strategies.status,
      isAuto: strategies.isAuto,
      strategyKey: strategies.strategyKey,
      autoDerivedLabel: strategies.autoDerivedLabel,
    })
    .from(strategies)
    .where(
      and(
        eq(strategies.accountId, pos.accountId),
        eq(strategies.strategyKey, derivedKey)
      )
    )
    .orderBy(
      // Prioritize: active > draft > complete > merged > rejected
      sql`CASE
        WHEN ${strategies.status} = 'active' THEN 0
        WHEN ${strategies.status} = 'draft' THEN 1
        WHEN ${strategies.status} = 'complete' THEN 2
        WHEN ${strategies.status} = 'merged' THEN 3
        ELSE 4
      END`,
      // Within same status, prefer strategies with more positions
      sql`(
        SELECT COUNT(*)
        FROM ${positions}
        WHERE ${positions.strategyId} = ${strategies.id}
        AND ${positions.quantity} != 0
      ) DESC`
    );

  // Process based on what we found for the exact key
  for (const strategy of allStrategiesForKey) {
    if (strategy.status === 'active' || strategy.status === 'draft') {
      // Found a usable strategy - link to it
      if (strategy.isAuto) {
        await db
          .update(strategies)
          .set({
            autoSource: options?.source ?? 'position',
            autoDerivedLabel: derivedLabel ?? derivedKey,
            updatedAt: new Date(),
          })
          .where(eq(strategies.id, strategy.id));
      }
      return { id: strategy.id, created: false };
    }

    if (strategy.status === 'complete') {
      // Completed strategy has new positions - reactivate it
      await db
        .update(strategies)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(strategies.id, strategy.id));
      await logToJournal({
        objectType: 'strategy',
        objectId: strategy.id,
        objectTitle: strategy.autoDerivedLabel ?? strategy.strategyKey,
        actionType: 'status_change',
        actionDescription: 'Strategy reactivated: new positions detected after completion',
        previousState: { status: 'complete' },
        newState: { status: 'active' },
        source: 'automation',
      });
      return { id: strategy.id, created: false };
    }

    if (strategy.status === 'merged') {
      // Strategy was merged — follow merged_into_id to find target (cross-account)
      const mergeTarget = await resolveStrategyMergeTarget(strategy.id);
      if (mergeTarget && (mergeTarget.status === 'active' || mergeTarget.status === 'draft')) {
        return { id: mergeTarget.id, created: false };
      }
      // If chain broken or target is complete/rejected, continue searching
      continue;
    }

    if (strategy.status === 'rejected') {
      // User explicitly rejected this strategy - DON'T create a new one
      // Return null to leave position unlinked
      return null;
    }
  }

  // PARENT UNDERLYING CHECK: If this underlying has a parent (e.g., CBBTC -> BTC),
  // check if there's an active/draft/complete strategy for the parent.
  // This handles wrapped tokens, staked tokens, etc. that should roll up to the parent.
  if (parentKey) {
    const parentStrategies = await db
      .select({
        id: strategies.id,
        status: strategies.status,
      })
      .from(strategies)
      .where(
        and(
          eq(strategies.accountId, pos.accountId),
          eq(strategies.strategyKey, parentKey)
        )
      )
      .orderBy(
        sql`CASE
          WHEN ${strategies.status} = 'active' THEN 0
          WHEN ${strategies.status} = 'draft' THEN 1
          WHEN ${strategies.status} = 'complete' THEN 2
          ELSE 3
        END`
      );

    for (const parentStrategy of parentStrategies) {
      if (parentStrategy.status === 'active' || parentStrategy.status === 'draft' || parentStrategy.status === 'complete') {
        // Found a usable parent strategy - link to it
        return { id: parentStrategy.id, created: false };
      }
      if (parentStrategy.status === 'rejected') {
        // Parent was rejected - don't create for child either
        return null;
      }
      if (parentStrategy.status === 'merged') {
        // Parent was merged — follow merged_into_id to find target (cross-account)
        const mergeTarget = await resolveStrategyMergeTarget(parentStrategy.id);
        if (mergeTarget && (mergeTarget.status === 'active' || mergeTarget.status === 'draft')) {
          return { id: mergeTarget.id, created: false };
        }
        // If chain broken, continue searching
      }
    }
  }

  // FALLBACK for CRYPTO/PERP: If no exact key match, try to find strategies that have
  // positions with the same symbol + asset class. This catches existing strategies where
  // the strategyKey might have been manually edited.
  // Note: Using .select() not .selectDistinct() because PostgreSQL requires ORDER BY
  // expressions to appear in SELECT DISTINCT list, and we use a CASE expression.
  // Since we limit(1), DISTINCT is unnecessary anyway.
  if (pos.assetClass === 'CRYPTO' || pos.assetClass === 'PERP') {
    const strategiesWithSameSymbol = await db
      .select({
        strategyId: positions.strategyId,
        status: strategies.status,
      })
      .from(positions)
      .innerJoin(strategies, eq(positions.strategyId, strategies.id))
      .where(
        and(
          eq(positions.accountId, pos.accountId),
          eq(positions.symbol, pos.symbol),
          eq(positions.assetClass, pos.assetClass),
          isNotNull(positions.strategyId)
        )
      )
      // Prefer active strategies, then draft, then complete (skip rejected/merged)
      .orderBy(
        sql`CASE
          WHEN ${strategies.status} = 'active' THEN 0
          WHEN ${strategies.status} = 'draft' THEN 1
          WHEN ${strategies.status} = 'complete' THEN 2
          ELSE 3
        END`
      )
      .limit(1);

    if (strategiesWithSameSymbol.length > 0 && strategiesWithSameSymbol[0].strategyId) {
      const foundStatus = strategiesWithSameSymbol[0].status;
      // Only link to active/draft/complete strategies, not rejected/merged
      if (foundStatus === 'active' || foundStatus === 'draft' || foundStatus === 'complete') {
        return { id: strategiesWithSameSymbol[0].strategyId, created: false };
      }
      // If only rejected/merged found via position lookup, check if there's a rejected strategy
      // for this account+symbol and don't create if so
      if (foundStatus === 'rejected') {
        return null;
      }
    }

    // Also check if there's a rejected strategy for this account+symbol (even without positions)
    const rejectedStrategy = await db
      .select({ id: strategies.id })
      .from(strategies)
      .where(
        and(
          eq(strategies.accountId, pos.accountId),
          sql`${strategies.strategyKey} LIKE ${pos.symbol + '-%'}`,
          eq(strategies.status, 'rejected')
        )
      )
      .limit(1);

    if (rejectedStrategy.length > 0) {
      // Don't create - user previously rejected a strategy for this symbol
      return null;
    }
  }

  const templateId = await ensureStrategyTemplate(derivedKey, derivedLabel ?? derivedKey, underlyingId);
  const openedAt = pos.openDate ?? (pos.snapshotDate ? new Date(pos.snapshotDate) : new Date());

  const [created] = await db
    .insert(strategies)
    .values({
      strategyTemplateId: templateId,
      strategyKey: derivedKey,
      accountId: pos.accountId,
      openedAt,
      status: 'draft',
      isAuto: true,
      autoSource: options?.source ?? 'position',
      autoDerivedLabel: derivedLabel ?? derivedKey,
    })
    .returning();

  // Populate entry context fields from positions (entrySpot, netPremium, entryNotional, entryIv30)
  // This runs asynchronously - don't await to avoid blocking strategy creation
  populateStrategyEntryContext(created.id).catch((err) => {
    console.error(`Failed to populate entry context for strategy ${created.id}:`, err);
  });

  return { id: created.id, created: true };
}

async function findOrCreateStrategyFromTrade(
  trade: TradeMinimal,
  options?: { source?: string }
): Promise<{ id: string; created: boolean } | null> {
  const derivedKey = deriveStrategyKeyFromTrade(trade);
  if (!derivedKey) return null;

  const derivedLabel = deriveStrategyLabelFromTrade(trade);
  const { ticker } = extractTickerAndExpiryFromSymbol(trade.symbol);

  // Check if this underlying has a parent (e.g., CBBTC -> BTC, JITOSOL -> SOL)
  // If so, we should also consider strategies for the parent underlying
  let parentKey: string | null = null;
  const underlyingWithParent = await db
    .select({
      parentUnderlyingId: underlyings.parentUnderlyingId,
    })
    .from(underlyings)
    .where(eq(underlyings.ticker, ticker))
    .limit(1);

  if (underlyingWithParent[0]?.parentUnderlyingId) {
    const parentUnderlying = await db
      .select({ ticker: underlyings.ticker })
      .from(underlyings)
      .where(eq(underlyings.id, underlyingWithParent[0].parentUnderlyingId))
      .limit(1);
    if (parentUnderlying[0]?.ticker) {
      // Derive the parent strategy key (e.g., BTC-CRYPTO from CBBTC-CRYPTO)
      const assetSuffix = derivedKey.split('-').pop(); // CRYPTO, PERP, STK, etc.
      parentKey = `${parentUnderlying[0].ticker}-${assetSuffix}`;
    }
  }

  // First, check ALL strategies for this account+key to understand the full picture
  // This includes rejected/merged/complete strategies to make informed decisions
  const allStrategiesForKey = await db
    .select({
      id: strategies.id,
      status: strategies.status,
      isAuto: strategies.isAuto,
      strategyKey: strategies.strategyKey,
      autoDerivedLabel: strategies.autoDerivedLabel,
    })
    .from(strategies)
    .where(
      and(
        eq(strategies.accountId, trade.accountId),
        eq(strategies.strategyKey, derivedKey)
      )
    )
    .orderBy(
      // Prioritize: active > draft > complete > merged > rejected
      sql`CASE
        WHEN ${strategies.status} = 'active' THEN 0
        WHEN ${strategies.status} = 'draft' THEN 1
        WHEN ${strategies.status} = 'complete' THEN 2
        WHEN ${strategies.status} = 'merged' THEN 3
        ELSE 4
      END`
    );

  // Process based on what we found
  for (const strategy of allStrategiesForKey) {
    if (strategy.status === 'active' || strategy.status === 'draft') {
      // Found a usable strategy - link to it
      if (strategy.isAuto) {
        await db
          .update(strategies)
          .set({
            autoSource: options?.source ?? 'trade',
            autoDerivedLabel: derivedLabel ?? derivedKey,
            updatedAt: new Date(),
          })
          .where(eq(strategies.id, strategy.id));
      }
      return { id: strategy.id, created: false };
    }

    if (strategy.status === 'complete') {
      // Completed strategy has new trades - reactivate it
      await db
        .update(strategies)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(strategies.id, strategy.id));
      await logToJournal({
        objectType: 'strategy',
        objectId: strategy.id,
        objectTitle: strategy.autoDerivedLabel ?? strategy.strategyKey,
        actionType: 'status_change',
        actionDescription: 'Strategy reactivated: new trades detected after completion',
        previousState: { status: 'complete' },
        newState: { status: 'active' },
        source: 'automation',
      });
      return { id: strategy.id, created: false };
    }

    if (strategy.status === 'merged') {
      // Strategy was merged — follow merged_into_id to find target (cross-account)
      const mergeTarget = await resolveStrategyMergeTarget(strategy.id);
      if (mergeTarget && (mergeTarget.status === 'active' || mergeTarget.status === 'draft')) {
        return { id: mergeTarget.id, created: false };
      }
      // If chain broken or target is complete/rejected, continue searching
      continue;
    }

    if (strategy.status === 'rejected') {
      // User explicitly rejected this strategy - DON'T create a new one
      // Return null to leave trade unlinked
      return null;
    }
  }

  // PARENT UNDERLYING CHECK: If this underlying has a parent (e.g., CBBTC -> BTC),
  // check if there's an active/draft/complete strategy for the parent.
  // This handles wrapped tokens, staked tokens, etc. that should roll up to the parent.
  if (parentKey) {
    const parentStrategies = await db
      .select({
        id: strategies.id,
        status: strategies.status,
      })
      .from(strategies)
      .where(
        and(
          eq(strategies.accountId, trade.accountId),
          eq(strategies.strategyKey, parentKey)
        )
      )
      .orderBy(
        sql`CASE
          WHEN ${strategies.status} = 'active' THEN 0
          WHEN ${strategies.status} = 'draft' THEN 1
          WHEN ${strategies.status} = 'complete' THEN 2
          ELSE 3
        END`
      );

    for (const parentStrategy of parentStrategies) {
      if (parentStrategy.status === 'active' || parentStrategy.status === 'draft' || parentStrategy.status === 'complete') {
        // Found a usable parent strategy - link to it
        return { id: parentStrategy.id, created: false };
      }
      if (parentStrategy.status === 'rejected') {
        // Parent was rejected - don't create for child either
        return null;
      }
      if (parentStrategy.status === 'merged') {
        // Parent was merged — follow merged_into_id to find target (cross-account)
        const mergeTarget = await resolveStrategyMergeTarget(parentStrategy.id);
        if (mergeTarget && (mergeTarget.status === 'active' || mergeTarget.status === 'draft')) {
          return { id: mergeTarget.id, created: false };
        }
        // If chain broken, continue searching
      }
    }
  }

  // FALLBACK for CRYPTO/PERP: If no exact key match, try to find strategies that have
  // positions with the same symbol + asset class. This catches existing strategies where
  // the strategyKey might have been manually edited.
  if (trade.assetClass === 'CRYPTO' || trade.assetClass === 'PERP') {
    // Note: Using .select() not .selectDistinct() because PostgreSQL requires ORDER BY
    // expressions to appear in SELECT DISTINCT list, and we use a CASE expression.
    // Since we limit(1), DISTINCT is unnecessary anyway.
    const strategiesWithSameSymbol = await db
      .select({
        strategyId: positions.strategyId,
        status: strategies.status,
      })
      .from(positions)
      .innerJoin(strategies, eq(positions.strategyId, strategies.id))
      .where(
        and(
          eq(positions.accountId, trade.accountId),
          eq(positions.symbol, ticker),
          eq(positions.assetClass, trade.assetClass),
          isNotNull(positions.strategyId)
        )
      )
      // Prefer active strategies, then draft, then complete (skip rejected/merged)
      .orderBy(
        sql`CASE
          WHEN ${strategies.status} = 'active' THEN 0
          WHEN ${strategies.status} = 'draft' THEN 1
          WHEN ${strategies.status} = 'complete' THEN 2
          ELSE 3
        END`
      )
      .limit(1);

    if (strategiesWithSameSymbol.length > 0 && strategiesWithSameSymbol[0].strategyId) {
      const foundStatus = strategiesWithSameSymbol[0].status;
      // Only link to active/draft/complete strategies, not rejected/merged
      if (foundStatus === 'active' || foundStatus === 'draft' || foundStatus === 'complete') {
        return { id: strategiesWithSameSymbol[0].strategyId, created: false };
      }
      // If only rejected found via position lookup, don't create
      if (foundStatus === 'rejected') {
        return null;
      }
    }

    // Also check if there's a rejected strategy for this account+symbol (even without positions)
    const rejectedStrategy = await db
      .select({ id: strategies.id })
      .from(strategies)
      .where(
        and(
          eq(strategies.accountId, trade.accountId),
          sql`${strategies.strategyKey} LIKE ${ticker + '-%'}`,
          eq(strategies.status, 'rejected')
        )
      )
      .limit(1);

    if (rejectedStrategy.length > 0) {
      // Don't create - user previously rejected a strategy for this symbol
      return null;
    }
  }

  // Need an underlying ID (ticker already extracted above for fallback)
  const underlyingId = await ensureUnderlyingId(ticker, null, trade.assetClass);
  if (!underlyingId) return null;

  const templateId = await ensureStrategyTemplate(
    derivedKey,
    derivedLabel ?? derivedKey,
    underlyingId
  );

  const openedAt = trade.tradeDate ?? new Date();

  const [created] = await db
    .insert(strategies)
    .values({
      strategyTemplateId: templateId,
      strategyKey: derivedKey,
      accountId: trade.accountId,
      openedAt,
      status: 'draft',
      isAuto: true,
      autoSource: options?.source ?? 'trade',
      autoDerivedLabel: derivedLabel ?? derivedKey,
    })
    .returning();

  // Populate entry context fields from positions (entrySpot, netPremium, entryNotional, entryIv30)
  // This runs asynchronously - don't await to avoid blocking strategy creation
  populateStrategyEntryContext(created.id).catch((err) => {
    console.error(`Failed to populate entry context for strategy ${created.id}:`, err);
  });

  return { id: created.id, created: true };
}

export async function autoLinkPositionsToStrategies(
  accountId: string,
  range?: DateRangeOptions
): Promise<{ strategiesCreated: number; positionsLinked: number; skipped: number }> {
  const whereClauses = [
    eq(positions.accountId, accountId),
    isNull(positions.strategyId),
    sql`${positions.quantity} != 0`,
  ];

  if (range?.snapshotDate) {
    whereClauses.push(eq(positions.snapshotDate, range.snapshotDate));
  } else if (range?.startDate && range?.endDate) {
    whereClauses.push(gte(positions.snapshotDate, range.startDate));
    whereClauses.push(lte(positions.snapshotDate, range.endDate));
  }

  const rows = await db
    .select({
      id: positions.id,
      accountId: positions.accountId,
      symbol: positions.symbol,
      assetClass: positions.assetClass,
      expiry: positions.expiry,
      snapshotDate: positions.snapshotDate,
      openDate: positions.openDate,
      underlyingId: positions.underlyingId,
      conid: positions.conid,
    })
    .from(positions)
    .where(and(...whereClauses));

  let strategiesCreated = 0;
  let positionsLinked = 0;
  let skipped = 0;

  for (const pos of rows) {
    let strategyId: string | null = null;
    let strategyCreated = false;

    // PRIMARY METHOD: Match by conid (unique contract identifier)
    // This is the most reliable way - same conid = same strategy across all snapshot dates
    // This preserves strategy linkage when re-ingesting data
    if (pos.conid) {
      const existingPosition = await db
        .select({
          strategyId: positions.strategyId,
        })
        .from(positions)
        .where(
          and(
            eq(positions.conid, pos.conid),
            eq(positions.accountId, pos.accountId),
            isNotNull(positions.strategyId),
            sql`${positions.quantity} != 0`
          )
        )
        .orderBy(desc(positions.snapshotDate)) // Prefer more recent positions
        .limit(1);

      if (existingPosition.length > 0 && existingPosition[0].strategyId) {
        const strategy = await db
          .select({ id: strategies.id, status: strategies.status })
          .from(strategies)
          .where(eq(strategies.id, existingPosition[0].strategyId))
          .limit(1);

        if (strategy.length > 0) {
          const st = strategy[0];
          if (st.status === 'merged') {
            // Strategy was merged — follow merged_into_id to find target (cross-account)
            const mergeTarget = await resolveStrategyMergeTarget(st.id);
            if (mergeTarget && (mergeTarget.status === 'active' || mergeTarget.status === 'draft')) {
              strategyId = mergeTarget.id;
            }
            // If no valid target found, fall through to derived-key fallback
          } else {
            // Active, draft, complete, rejected — link directly
            strategyId = st.id;
          }
        }
      }
    }

    // FALLBACK: No conid match found (or conid matched a merged strategy)
    // Before creating a new strategy, try to find existing strategies by:
    // 1. Matching by derived strategy key (e.g., "IBIT 260918")
    // 2. Cross-account merge target detection (for merged strategies)
    // 3. Matching by underlying ticker + expiry (for complete strategies being reopened)
    // NOTE: Merged strategies are skipped — positions should link to the active merge target
    if (!strategyId) {
      // First, try to find by derived key (this should match existing strategies)
      const derivedKey = deriveStrategyKeyFromPosition(pos);
      if (derivedKey) {
        // Look for strategies with this key, ordered by preference
        // Exclude merged — those should be resolved to their merge target
        const existingByKey = await db
          .select({
            id: strategies.id,
            strategyKey: strategies.strategyKey,
            status: strategies.status,
          })
          .from(strategies)
          .where(
            and(
              eq(strategies.accountId, pos.accountId),
              eq(strategies.strategyKey, derivedKey)
            )
          )
          .orderBy(
            // Prefer: active > draft > complete > rejected (merged handled separately)
            sql`CASE
              WHEN ${strategies.status} = 'active' THEN 0
              WHEN ${strategies.status} = 'draft' THEN 1
              WHEN ${strategies.status} = 'complete' THEN 2
              WHEN ${strategies.status} = 'merged' THEN 3
              ELSE 4
            END`
          )
          .limit(5); // Fetch a few so we can skip merged and find active

        // Find the best non-merged match
        const matched = existingByKey.find(s => s.status !== 'merged');
        if (matched) {
          // Active, draft, complete, or rejected — link directly
          strategyId = matched.id;
        } else if (existingByKey.length > 0 && existingByKey[0].status === 'merged') {
          // All matches are merged — follow merged_into_id to find target (cross-account)
          const mergeTarget = await resolveStrategyMergeTarget(existingByKey[0].id);
          if (mergeTarget && (mergeTarget.status === 'active' || mergeTarget.status === 'draft')) {
            strategyId = mergeTarget.id;
          }
          // If no merge target found, fall through to findOrCreateStrategyFromPosition
        } else if (pos.underlyingId && pos.expiry && pos.assetClass === 'OPT') {
          // If no exact key match, try to find strategies that have positions with same underlying + expiry
          // This catches existing strategies where the key might have been edited
          const strategiesWithSameUnderlying = await db
            .selectDistinct({
              strategyId: positions.strategyId,
            })
            .from(positions)
            .where(
              and(
                eq(positions.accountId, pos.accountId),
                eq(positions.underlyingId, pos.underlyingId),
                eq(positions.expiry, pos.expiry),
                eq(positions.assetClass, 'OPT'),
                isNotNull(positions.strategyId),
                sql`${positions.quantity} != 0`
              )
            )
            .limit(1);

          if (strategiesWithSameUnderlying.length > 0 && strategiesWithSameUnderlying[0].strategyId) {
            // Verify the strategy still exists (regardless of status - link is permanent)
            const strategy = await db
              .select({ id: strategies.id, status: strategies.status })
              .from(strategies)
              .where(eq(strategies.id, strategiesWithSameUnderlying[0].strategyId))
              .limit(1);

            if (strategy.length > 0) {
              // Link to strategy regardless of status (rejected, merged, etc.)
              strategyId = strategy[0].id;
            }
          }
        } else if (pos.assetClass === 'CRYPTO' || pos.assetClass === 'PERP') {
          // For CRYPTO/PERP: If no exact key match, try to find strategies that have positions
          // with the same symbol + asset class. This catches existing strategies where the
          // strategyKey might have been manually edited (e.g., "Bitcoin Spot Long" vs "BTC-CRYPTO")
          // IMPORTANT: Include rejected/merged - link is permanent, status filters views
          // Note: Using .select() not .selectDistinct() because PostgreSQL requires ORDER BY
          // expressions to appear in SELECT DISTINCT list, and we use a CASE expression.
          // Since we limit(1), DISTINCT is unnecessary anyway.
          const strategiesWithSameSymbol = await db
            .select({
              strategyId: positions.strategyId,
              status: strategies.status,
            })
            .from(positions)
            .innerJoin(strategies, eq(positions.strategyId, strategies.id))
            .where(
              and(
                eq(positions.accountId, pos.accountId),
                eq(positions.symbol, pos.symbol),
                eq(positions.assetClass, pos.assetClass),
                isNotNull(positions.strategyId)
              )
            )
            // Prefer: active > draft > complete > merged > rejected
            .orderBy(
              sql`CASE
                WHEN ${strategies.status} = 'active' THEN 0
                WHEN ${strategies.status} = 'draft' THEN 1
                WHEN ${strategies.status} = 'complete' THEN 2
                WHEN ${strategies.status} = 'merged' THEN 3
                ELSE 4
              END`
            )
            .limit(1);

          if (strategiesWithSameSymbol.length > 0 && strategiesWithSameSymbol[0].strategyId) {
            const foundStatus = strategiesWithSameSymbol[0].status;
            if (foundStatus === 'merged') {
              // Follow merged_into_id to find target (cross-account)
              const mergeTarget = await resolveStrategyMergeTarget(strategiesWithSameSymbol[0].strategyId!);
              if (mergeTarget && (mergeTarget.status === 'active' || mergeTarget.status === 'draft')) {
                strategyId = mergeTarget.id;
              }
            } else {
              strategyId = strategiesWithSameSymbol[0].strategyId;
            }
          }
        }
      }

      // If still no match, create new strategy (truly new position)
      if (!strategyId) {
        const strategyResult = await findOrCreateStrategyFromPosition(pos);
        if (!strategyResult) {
          skipped++;
          continue;
        }
        strategyId = strategyResult.id;
        strategyCreated = strategyResult.created;
      }
    }

    if (strategyCreated) {
      strategiesCreated++;
    }

    await db.update(positions).set({ strategyId }).where(eq(positions.id, pos.id));
    positionsLinked++;
  }

  return { strategiesCreated, positionsLinked, skipped };
}

export async function autoLinkTradesToStrategies(
  accountId: string,
  range?: DateRangeOptions
): Promise<{ strategiesCreated: number; tradesLinked: number; skipped: number }> {
  const whereClauses = [eq(trades.accountId, accountId), isNull(trades.strategyId)];

  if (range?.snapshotDate) {
    whereClauses.push(eq(sql`date(${trades.tradeDate})`, range.snapshotDate));
  } else if (range?.startDate && range?.endDate) {
    whereClauses.push(gte(sql`date(${trades.tradeDate})`, range.startDate));
    whereClauses.push(lte(sql`date(${trades.tradeDate})`, range.endDate));
  }

  const rows = await db
    .select({
      id: trades.id,
      accountId: trades.accountId,
      symbol: trades.symbol,
      assetClass: trades.assetClass,
      tradeDate: trades.tradeDate,
    })
    .from(trades)
    .where(and(...whereClauses))
    .limit(5000);

  let strategiesCreated = 0;
  let tradesLinked = 0;
  let skipped = 0;

  for (const trade of rows) {
    const strategyResult = await findOrCreateStrategyFromTrade(trade);
    if (!strategyResult) {
      skipped++;
      continue;
    }

    if (strategyResult.created) {
      strategiesCreated++;
    }

    await db.update(trades).set({ strategyId: strategyResult.id }).where(eq(trades.id, trade.id));
    tradesLinked++;
  }

  return { strategiesCreated, tradesLinked, skipped };
}

