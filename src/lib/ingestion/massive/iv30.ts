/**
 * Calculate ATM IV30 from a Massive options chain snapshot.
 *
 * Strategy:
 *   1. Filter contracts to DTE 20-40 (preferred) or all contracts if that window is empty.
 *   2. Require iv >= 10% and iv <= 500% to exclude deep ITM/OTM and glitched values.
 *   3. If spot is known, prefer strikes within 5% of spot (expand to 10% if none qualify).
 *   4. Sort by (|dte-30|, distance-from-spot); average IV of the top 3.
 */

import { calculateDte } from './client';
import type { MassiveOptionsChainResponse } from './client';

const MIN_IV = 0.1;  // 10%
const MAX_IV = 5.0;  // 500%

export function calculateIv30FromChain(
  chain: MassiveOptionsChainResponse,
  snapshotDate: string,
  spot: number | null
): number | null {
  if (!chain.results || chain.results.length === 0) return null;

  const candidates: Array<{ iv: number; dte: number; distance: number }> = [];

  for (const opt of chain.results) {
    const strike = Number(opt.details?.strike_price);
    const expiration = opt.details?.expiration_date;
    const ivRaw = opt.implied_volatility;

    if (!Number.isFinite(strike) || strike <= 0 || !expiration) continue;
    const iv = ivRaw !== undefined && ivRaw !== null ? Number(ivRaw) : NaN;
    if (!Number.isFinite(iv) || iv < MIN_IV || iv > MAX_IV) continue;

    const dte = calculateDte(expiration, snapshotDate);
    if (dte === null || dte < 0) continue;

    const distance = spot && spot > 0 ? Math.abs(strike - spot) / spot : 999;
    candidates.push({ iv, dte, distance });
  }

  if (candidates.length === 0) return null;

  // Prefer the 20-40 DTE window; fall back to all contracts if empty.
  const near30 = candidates.filter((c) => c.dte >= 20 && c.dte <= 40);
  const pool = near30.length > 0 ? near30 : candidates;

  // If we have spot, require ATM band; expand if no hits.
  let atm: typeof pool = pool;
  if (spot && spot > 0) {
    atm = pool.filter((c) => c.distance <= 0.05);
    if (atm.length === 0) atm = pool.filter((c) => c.distance <= 0.1);
    if (atm.length === 0) atm = pool;
  }

  atm.sort((a, b) => {
    const dteDiffA = Math.abs(a.dte - 30);
    const dteDiffB = Math.abs(b.dte - 30);
    if (dteDiffA !== dteDiffB) return dteDiffA - dteDiffB;
    return a.distance - b.distance;
  });

  const top = atm.slice(0, Math.min(3, atm.length));
  if (top.length === 0) return null;
  return top.reduce((sum, c) => sum + c.iv, 0) / top.length;
}
