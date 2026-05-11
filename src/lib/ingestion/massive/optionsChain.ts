/**
 * Options-chain fetch + upsert helpers.
 *
 * - `fetchOptionsChain` — generalized chain snapshot fetch with DTE + strike filters.
 *   Reused by both the daily IV30 ingest (narrow 20-40 DTE window) and the radar
 *   back-months pull (1M-9M monthly window for the watchlist).
 * - `storeOptionsChainSnapshots` — idempotent bulk upsert into options_chain_snapshots.
 */

import { db } from '@/db';
import { optionsChainSnapshots } from '@/db/schema';
import type { NewOptionsChainSnapshot } from '@/db/schema';
import { buildMassiveUrl, calculateDte, fetchMassive } from './client';
import type { MassiveOptionsChainResponse } from './client';

export interface FetchOptionsChainParams {
  ticker: string;
  minExpiry: string;  // YYYY-MM-DD, inclusive
  maxExpiry: string;  // YYYY-MM-DD, inclusive
  strikeMin?: number; // optional, inclusive
  strikeMax?: number; // optional, inclusive
  limit?: number;     // default 250 (Massive page size)
}

/**
 * Fetch a Massive v3 options chain snapshot for the given ticker + expiry window.
 * Returns the raw response (caller iterates results[]). Handles pagination via next_url.
 */
export async function fetchOptionsChain(
  params: FetchOptionsChainParams
): Promise<MassiveOptionsChainResponse> {
  const { ticker, minExpiry, maxExpiry, strikeMin, strikeMax, limit = 250 } = params;
  const initialUrl = buildMassiveUrl(`/v3/snapshot/options/${ticker}`, {
    limit,
    'expiration_date.gte': minExpiry,
    'expiration_date.lte': maxExpiry,
    'strike_price.gte': strikeMin,
    'strike_price.lte': strikeMax,
  });

  const first = await fetchMassive<MassiveOptionsChainResponse>(initialUrl);
  const allResults = first.results ? [...first.results] : [];

  let nextUrl = first.next_url;
  let pageCount = 1;
  while (nextUrl && pageCount < 20) {
    // Massive returns next_url without apiKey; append it for auth.
    const page = await fetchMassive<MassiveOptionsChainResponse>(buildMassiveUrl(nextUrl));
    if (page.results) allResults.push(...page.results);
    nextUrl = page.next_url;
    pageCount += 1;
  }

  return { ...first, results: allResults, next_url: undefined };
}

export interface StoreChainResult {
  inserted: number;
  errors: number;
}

/**
 * Upsert all options contracts from a chain snapshot into options_chain_snapshots.
 * Idempotent via composite unique (ticker, snapshotDate, contractType, strike, expirationDate, source).
 * Batched with ON CONFLICT DO NOTHING; falls back to per-row inserts on batch failure.
 */
export async function storeOptionsChainSnapshots(opts: {
  ticker: string;
  snapshotDate: string;
  underlyingId: string | null;
  spot: number | null;
  chain: MassiveOptionsChainResponse;
  source?: string;
}): Promise<StoreChainResult> {
  const {
    ticker,
    snapshotDate,
    underlyingId,
    spot,
    chain,
    source = 'massive',
  } = opts;

  if (!chain.results || chain.results.length === 0) {
    return { inserted: 0, errors: 0 };
  }

  const records: NewOptionsChainSnapshot[] = [];

  for (const opt of chain.results) {
    const details = opt.details;
    if (!details?.strike_price || !details?.expiration_date) continue;

    const strike = Number(details.strike_price);
    if (!Number.isFinite(strike) || strike <= 0) continue;

    const expirationDate = details.expiration_date;
    const dte = calculateDte(expirationDate, snapshotDate);
    if (dte === null || dte < 0) continue;

    const ivRaw = opt.implied_volatility;
    const iv =
      ivRaw !== undefined && ivRaw !== null && Number.isFinite(Number(ivRaw))
        ? Number(ivRaw)
        : null;

    const bid = opt.last_quote?.bid ?? null;
    const ask = opt.last_quote?.ask ?? null;
    const last = opt.last_quote?.midpoint ?? opt.day?.close ?? null;
    const volume = opt.day?.volume ?? null;
    const openInterest = opt.open_interest ?? null;

    const greeks = opt.greeks ?? {};
    const numOrNull = (v: unknown): string | null => {
      if (v === undefined || v === null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n.toString() : null;
    };

    records.push({
      underlyingId: underlyingId ?? undefined,
      ticker: ticker.toUpperCase(),
      snapshotDate,
      underlyingSpot: spot != null ? spot.toString() : null,
      source,
      contractType: details.contract_type ?? null,
      strike: strike.toString(),
      expirationDate,
      dte,
      impliedVolatility: iv != null ? iv.toString() : null,
      bid: numOrNull(bid),
      ask: numOrNull(ask),
      last: numOrNull(last),
      volume: volume != null ? Math.floor(Number(volume)) : null,
      openInterest: openInterest != null ? Math.floor(Number(openInterest)) : null,
      delta: numOrNull(greeks.delta),
      gamma: numOrNull(greeks.gamma),
      theta: numOrNull(greeks.theta),
      vega: numOrNull(greeks.vega),
      rawData: opt as unknown as Record<string, unknown>,
    });
  }

  let inserted = 0;
  let errors = 0;
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    try {
      await db
        .insert(optionsChainSnapshots)
        .values(batch)
        .onConflictDoNothing({
          target: [
            optionsChainSnapshots.ticker,
            optionsChainSnapshots.snapshotDate,
            optionsChainSnapshots.contractType,
            optionsChainSnapshots.strike,
            optionsChainSnapshots.expirationDate,
            optionsChainSnapshots.source,
          ],
        });
      inserted += batch.length;
    } catch {
      for (const record of batch) {
        try {
          await db
            .insert(optionsChainSnapshots)
            .values(record)
            .onConflictDoNothing({
              target: [
                optionsChainSnapshots.ticker,
                optionsChainSnapshots.snapshotDate,
                optionsChainSnapshots.contractType,
                optionsChainSnapshots.strike,
                optionsChainSnapshots.expirationDate,
                optionsChainSnapshots.source,
              ],
            });
          inserted += 1;
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string };
          if (e?.code === '23505' || e?.message?.includes('unique constraint')) continue;
          errors += 1;
          if (errors <= 5) {
            console.error(
              `[${ticker}] insert failed strike=${record.strike} exp=${record.expirationDate}:`,
              err
            );
          }
        }
      }
    }
  }

  return { inserted, errors };
}
