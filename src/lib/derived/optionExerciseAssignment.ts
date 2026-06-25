export type ExerciseAssignmentKind = 'exercise' | 'assignment';

export interface ExerciseAssignmentTrade {
  id: string;
  accountId: string;
  strategyId: string | null;
  symbol: string;
  assetClass: string | null;
  side: string | null;
  quantity: string | number | null;
  price: string | number | null;
  tradeDate: Date | string;
  rawRow?: unknown;
}

export interface ParsedOptionSymbol {
  ticker: string;
  expiryCode: string;
  right: 'C' | 'P';
  strike: number;
}

export interface ExerciseAssignmentMatch {
  kind: ExerciseAssignmentKind;
  strategyId: string;
  optionTradeIds: string[];
  ticker: string;
  expiryCode: string;
  right: 'C' | 'P';
  strike: number;
  optionContracts: number;
  stockShares: number;
}

export type ExerciseAssignmentMatchResult =
  | { status: 'matched'; match: ExerciseAssignmentMatch }
  | { status: 'ambiguous'; matches: ExerciseAssignmentMatch[] }
  | { status: 'none' };

const CONTRACT_MULTIPLIER = 100;

function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  return typeof value === 'number' ? value : parseFloat(value);
}

function dateKey(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function sideFromTrade(trade: ExerciseAssignmentTrade): 'BUY' | 'SELL' | null {
  const side = trade.side?.toUpperCase();
  if (side === 'BUY' || side === 'SELL') return side;
  const quantity = num(trade.quantity);
  if (Number.isNaN(quantity) || quantity === 0) return null;
  return quantity > 0 ? 'BUY' : 'SELL';
}

function approxEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function flexNotesCodes(rawRow: unknown): Set<string> {
  if (!rawRow || typeof rawRow !== 'object') return new Set();
  const row = rawRow as Record<string, unknown>;
  const raw =
    row['Notes/Codes'] ??
    row['NotesCodes'] ??
    row['Notes Codes'] ??
    row['notes/codes'] ??
    row['notesCodes'];
  if (typeof raw !== 'string') return new Set();
  return new Set(
    raw
      .split(/[;,]/)
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

export function classifyExerciseAssignmentKind(
  trade: Pick<ExerciseAssignmentTrade, 'rawRow'>
): ExerciseAssignmentKind | null {
  const codes = flexNotesCodes(trade.rawRow);
  if (codes.has('Ex')) return 'exercise';
  if (codes.has('A')) return 'assignment';
  return null;
}

export function isStockExerciseAssignmentTrade(trade: ExerciseAssignmentTrade): boolean {
  return trade.assetClass === 'STK' && classifyExerciseAssignmentKind(trade) !== null;
}

export function parseListedOptionSymbol(symbol: string): ParsedOptionSymbol | null {
  const normalized = symbol.trim().replace(/\s+/g, ' ');
  const match = normalized.match(/^([A-Z0-9.]+)\s+(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  const strike = parseInt(match[4], 10) / 1000;
  if (!Number.isFinite(strike)) return null;
  return {
    ticker: match[1],
    expiryCode: match[2],
    right: match[3] as 'C' | 'P',
    strike,
  };
}

function stockSideMatchesOptionClose(
  kind: ExerciseAssignmentKind,
  right: 'C' | 'P',
  stockSide: 'BUY' | 'SELL' | null
): boolean {
  if (!stockSide) return false;
  if (kind === 'exercise') {
    return right === 'C' ? stockSide === 'BUY' : stockSide === 'SELL';
  }
  return right === 'C' ? stockSide === 'SELL' : stockSide === 'BUY';
}

export function matchStockExerciseAssignmentToOptionStrategy(
  stockTrade: ExerciseAssignmentTrade,
  optionTrades: ExerciseAssignmentTrade[]
): ExerciseAssignmentMatchResult {
  const kind = classifyExerciseAssignmentKind(stockTrade);
  if (!kind || stockTrade.assetClass !== 'STK') return { status: 'none' };

  const stockTicker = stockTrade.symbol.trim();
  const stockShares = Math.abs(num(stockTrade.quantity));
  const stockPrice = num(stockTrade.price);
  if (!stockTicker || !Number.isFinite(stockShares) || !Number.isFinite(stockPrice)) {
    return { status: 'none' };
  }

  const stockDate = dateKey(stockTrade.tradeDate);
  const stockSide = sideFromTrade(stockTrade);
  const groups = new Map<string, ExerciseAssignmentMatch>();

  for (const optionTrade of optionTrades) {
    if (optionTrade.assetClass !== 'OPT') continue;
    if (!optionTrade.strategyId) continue;
    if (optionTrade.accountId !== stockTrade.accountId) continue;
    if (dateKey(optionTrade.tradeDate) !== stockDate) continue;
    if (classifyExerciseAssignmentKind(optionTrade) !== kind) continue;

    const parsed = parseListedOptionSymbol(optionTrade.symbol);
    if (!parsed) continue;
    if (parsed.ticker !== stockTicker) continue;
    if (!approxEqual(parsed.strike, stockPrice, 0.01)) continue;
    if (!stockSideMatchesOptionClose(kind, parsed.right, stockSide)) continue;

    const optionContracts = Math.abs(num(optionTrade.quantity));
    if (!Number.isFinite(optionContracts) || optionContracts === 0) continue;

    const key = [
      optionTrade.strategyId,
      kind,
      parsed.ticker,
      parsed.expiryCode,
      parsed.right,
      parsed.strike.toFixed(3),
    ].join('|');
    const existing = groups.get(key);
    if (existing) {
      existing.optionTradeIds.push(optionTrade.id);
      existing.optionContracts += optionContracts;
    } else {
      groups.set(key, {
        kind,
        strategyId: optionTrade.strategyId,
        optionTradeIds: [optionTrade.id],
        ticker: parsed.ticker,
        expiryCode: parsed.expiryCode,
        right: parsed.right,
        strike: parsed.strike,
        optionContracts,
        stockShares,
      });
    }
  }

  const matches = [...groups.values()].filter((match) =>
    approxEqual(stockShares, match.optionContracts * CONTRACT_MULTIPLIER, 0.01)
  );

  if (matches.length === 1) return { status: 'matched', match: matches[0] };
  if (matches.length > 1) return { status: 'ambiguous', matches };
  return { status: 'none' };
}
