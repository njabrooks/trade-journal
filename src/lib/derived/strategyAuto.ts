import { db } from '@/db';
import {
  positions,
  trades,
  strategies,
  strategyTemplates,
  underlyings,
} from '@/db/schema';
import { and, eq, isNull, isNotNull, gte, lte, sql, ne, desc, or } from 'drizzle-orm';
import { populateStrategyEntryContext } from '@/lib/services/strategies';

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

  // First, try to find existing non-rejected strategies with this key
  // Prioritize strategies that already have linked positions (likely the active/confirmed strategy)
  const existing = await db
    .select({
      id: strategies.id,
      status: strategies.status,
      isAuto: strategies.isAuto,
    })
    .from(strategies)
    .where(
      and(
        eq(strategies.accountId, pos.accountId),
        eq(strategies.strategyKey, derivedKey),
        ne(strategies.status, 'rejected')
      )
    )
    .orderBy(
      sql`(
        SELECT COUNT(*) 
        FROM ${positions} 
        WHERE ${positions.strategyId} = ${strategies.id} 
        AND ${positions.quantity} != 0
      ) DESC`
    ) // Prioritize strategies with existing positions
    .limit(1);

  if (existing.length > 0) {
    const strategy = existing[0];
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

  // Try to find an existing strategy (including auto)
  const existing = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.accountId, trade.accountId), eq(strategies.strategyKey, derivedKey)))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].isAuto) {
      await db
        .update(strategies)
        .set({
          autoSource: options?.source ?? 'trade',
          autoDerivedLabel: derivedLabel ?? derivedKey,
          updatedAt: new Date(),
        })
        .where(eq(strategies.id, existing[0].id));
    }
    return { id: existing[0].id, created: false };
  }

  // Need an underlying ID. Try to find by ticker extracted from symbol.
  const { ticker } = extractTickerAndExpiryFromSymbol(trade.symbol);
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
        // Verify the strategy still exists and is not rejected
        const strategy = await db
          .select({ id: strategies.id, status: strategies.status })
          .from(strategies)
          .where(
            and(
              eq(strategies.id, existingPosition[0].strategyId),
              ne(strategies.status, 'rejected')
            )
          )
          .limit(1);

        if (strategy.length > 0) {
          strategyId = strategy[0].id;
        }
      }
    }

    // FALLBACK: Only for brand new positions (no conid match in history)
    // Before creating a new strategy, try to find existing strategies by:
    // 1. Matching by derived strategy key (e.g., "IBIT 260918")
    // 2. Matching by underlying ticker + expiry (for complete strategies being reopened)
    if (!strategyId) {
      // First, try to find by derived key (this should match existing strategies)
      const derivedKey = deriveStrategyKeyFromPosition(pos);
      if (derivedKey) {
        // Look for existing strategies with this key that have positions
        // This will catch existing strategies that have other positions
        const existingByKey = await db
          .select({
            id: strategies.id,
            strategyKey: strategies.strategyKey,
          })
          .from(strategies)
          .where(
            and(
              eq(strategies.accountId, pos.accountId),
              eq(strategies.strategyKey, derivedKey),
              ne(strategies.status, 'rejected')
            )
          )
          .limit(1);

        if (existingByKey.length > 0) {
          strategyId = existingByKey[0].id;
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
            // Verify the strategy still exists and is not rejected
            const strategy = await db
              .select({ id: strategies.id, status: strategies.status })
              .from(strategies)
              .where(
                and(
                  eq(strategies.id, strategiesWithSameUnderlying[0].strategyId),
                  ne(strategies.status, 'rejected')
                )
              )
              .limit(1);

            if (strategy.length > 0) {
              strategyId = strategy[0].id;
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

