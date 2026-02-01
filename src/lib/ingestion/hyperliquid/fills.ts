/**
 * HyperLiquid fill normalization.
 * Converts HyperLiquid fill responses to CryptoTradeInput for insertion into trades table.
 */

import type { HLFill } from './api';
import type { CryptoTradeInput } from '../crypto/types';
import { normalizeHyperliquidCoin } from '../crypto/pairNormalization';

/**
 * Normalize a HyperLiquid fill into the common crypto trade shape.
 */
export function normalizeHLFill(
  fill: HLFill,
  accountId: string,
  spotMeta?: Map<string, string>
): CryptoTradeInput {
  const side = fill.side === 'B' ? 'BUY' : 'SELL';
  const quantity = fill.sz;
  const price = fill.px;

  const grossAmount = (parseFloat(price) * parseFloat(quantity)).toFixed(6);
  const fees = fill.fee;
  const netAmount = (parseFloat(grossAmount) - Math.abs(parseFloat(fees))).toFixed(6);

  // Determine asset class: spot tokens use @index format, perps use plain coin name
  const isSpot = fill.coin.startsWith('@');

  return {
    accountId,
    brokerTransactionId: `hl-${fill.tid}`,
    brokerExecId: fill.hash || null,
    assetClass: isSpot ? 'CRYPTO' : 'PERP',
    symbol: normalizeHyperliquidCoin(fill.coin, spotMeta),
    currency: 'USDC',
    tradeDate: new Date(fill.time),
    side,
    quantity,
    price,
    grossAmount,
    netAmount,
    fees,
    orderType: null,
    exchange: 'hyperliquid',
    rawRow: fill as unknown as Record<string, unknown>,
  };
}

/**
 * Fetch fills incrementally using time-based pagination.
 * HyperLiquid returns max 500 fills per call and has a 10K total limit.
 *
 * Returns all fills fetched plus the timestamp of the latest fill (for cursor update).
 */
export async function fetchAllFillsFrom(
  fetchFn: (user: string, startTime: number) => Promise<HLFill[]>,
  user: string,
  startTimeMs: number
): Promise<{ fills: HLFill[]; latestTimestamp: number }> {
  const allFills: HLFill[] = [];
  let cursor = startTimeMs;
  let latestTimestamp = startTimeMs;

  // Paginate: keep fetching while we get results
  while (true) {
    const batch = await fetchFn(user, cursor);

    if (batch.length === 0) break;

    allFills.push(...batch);

    // Track latest timestamp
    const batchMaxTime = Math.max(...batch.map((f) => f.time));
    if (batchMaxTime > latestTimestamp) {
      latestTimestamp = batchMaxTime;
    }

    // If we got fewer than 500, we've reached the end
    if (batch.length < 500) break;

    // Move cursor past the latest fill (+1ms to avoid re-fetching the same fill)
    cursor = batchMaxTime + 1;

    // Safety: don't exceed 10K fills total (API hard limit)
    if (allFills.length >= 10000) {
      console.warn('[HL] Reached 10,000 fill limit. Older fills may be missing.');
      break;
    }
  }

  return { fills: allFills, latestTimestamp };
}
