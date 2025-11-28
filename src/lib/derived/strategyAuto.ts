import { db } from '@/db';
import {
  positions,
  trades,
  strategies,
  strategyTemplates,
  underlyings,
} from '@/db/schema';
import { and, eq, isNull, gte, lte, sql } from 'drizzle-orm';

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

  if (pos.assetClass === 'OPT') {
    const expiryCode = formatExpiry(pos.expiry);
    if (expiryCode) {
      return `${pos.symbol} ${expiryCode}`;
    }
  }

  return null;
}

export function deriveStrategyLabelFromPosition(pos: PositionMinimal): string | null {
  if (pos.assetClass === 'STK' || pos.assetClass === 'FUT' || pos.assetClass === 'CFD') {
    return `${pos.symbol} Stock`;
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

  const existing = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.accountId, pos.accountId), eq(strategies.strategyKey, derivedKey)))
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
      entryContext: 'Auto-derived from positions',
      isAuto: true,
      autoSource: options?.source ?? 'position',
      autoDerivedLabel: derivedLabel ?? derivedKey,
    })
    .returning();

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
      entryContext: 'Auto-derived from trades',
      isAuto: true,
      autoSource: options?.source ?? 'trade',
      autoDerivedLabel: derivedLabel ?? derivedKey,
    })
    .returning();

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
    })
    .from(positions)
    .where(and(...whereClauses));

  let strategiesCreated = 0;
  let positionsLinked = 0;
  let skipped = 0;

  for (const pos of rows) {
    const strategyResult = await findOrCreateStrategyFromPosition(pos);
    if (!strategyResult) {
      skipped++;
      continue;
    }

    if (strategyResult.created) {
      strategiesCreated++;
    }

    await db.update(positions).set({ strategyId: strategyResult.id }).where(eq(positions.id, pos.id));
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

