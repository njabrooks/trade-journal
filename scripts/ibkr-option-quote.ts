#!/usr/bin/env tsx
/**
 * ⚠ DEPRECATED (2026-07-10) — do not use for live verification.
 *
 * This is the OLD Client Portal Gateway (port 5001) quote path. The CP gateway
 * is a legacy livePrices fallback and is usually NOT running — its absence is
 * normal. The live-verification path is the always-on IBC/TWS gateway on port
 * 4001 (launchd local.ibc-gateway, docs/v2/21):
 *   - multi-leg human-readable:  scripts/ibkr-option-quote.py  (the /ibkr-quote skill)
 *   - batch machine-readable:    scripts/ibkr-quote-contracts.py (stdin JSON)
 * Kept only for the rare case the CP gateway is deliberately running.
 *
 * Fetch live IBKR option quotes for a multi-leg structure.
 *
 * Uses the IBKR Client Portal Gateway API to get real bid/ask/last
 * for each leg, then computes the combo net price.
 *
 * Prerequisites:
 *   - IBKR Client Portal Gateway running (default https://localhost:5001)
 *   - Gateway authenticated (log in via browser)
 *
 * Usage:
 *   npx tsx scripts/ibkr-option-quote.ts --ticker IBIT --legs "BUY 49C Aug21, SELL 60C Aug21 x2, BUY 55C Aug21, SELL 36P Aug21"
 *   npx tsx scripts/ibkr-option-quote.ts --ticker IBIT --legs "BUY 49C 20260821, SELL 60C 20260821 x2, BUY 55C 20260821, SELL 36P 20260821"
 *
 * Leg format: ACTION STRIKE[C|P] EXPIRY [xQTY]
 *   ACTION: BUY or SELL
 *   STRIKE: number + C (call) or P (put)
 *   EXPIRY: YYYYMMDD or MonDD (e.g., Aug21 → 20260821)
 *   xQTY: optional multiplier (default 1)
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env.local') });

// ===================== IBKR CLIENT =====================

const GATEWAY_URL = process.env.IBKR_GATEWAY_URL || 'https://localhost:5001';

async function ibkrGet<T>(endpoint: string): Promise<T> {
  const origReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const resp = await fetch(`${GATEWAY_URL}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`IBKR ${resp.status}: ${text.slice(0, 200)}`);
    }
    return await resp.json();
  } finally {
    if (origReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = origReject;
    else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }
}

async function ibkrPost<T>(endpoint: string, body: any): Promise<T> {
  const origReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const resp = await fetch(`${GATEWAY_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`IBKR ${resp.status}: ${text.slice(0, 200)}`);
    }
    return await resp.json();
  } finally {
    if (origReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = origReject;
    else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }
}

// ===================== LEG PARSING =====================

interface ParsedLeg {
  action: 'BUY' | 'SELL';
  strike: number;
  right: 'C' | 'P';
  expiry: string; // YYYYMMDD
  qty: number;
}

function parseExpiry(raw: string): string {
  // If already YYYYMMDD
  if (/^\d{8}$/.test(raw)) return raw;

  // MonDD or MonYY format: Aug21 → 20260821
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const match = raw.match(/^([A-Za-z]{3})(\d{1,2})(?:'?(\d{2}))?$/);
  if (match) {
    const mon = months[match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1).toLowerCase()];
    const day = match[2]!.padStart(2, '0');
    const year = match[3] ? `20${match[3]}` : '2026'; // default to current year context
    if (mon) return `${year}${mon}${day}`;
  }

  throw new Error(`Cannot parse expiry: ${raw}`);
}

function parseLegs(input: string): ParsedLeg[] {
  return input.split(',').map(part => {
    part = part.trim();
    // Match: BUY 49C Aug21 x2
    const m = part.match(/^(BUY|SELL)\s+(\d+(?:\.\d+)?)(C|P)\s+(\S+)(?:\s+x(\d+))?$/i);
    if (!m) throw new Error(`Cannot parse leg: "${part}". Expected: BUY 49C Aug21 [x2]`);

    return {
      action: m[1]!.toUpperCase() as 'BUY' | 'SELL',
      strike: parseFloat(m[2]!),
      right: m[3]!.toUpperCase() as 'C' | 'P',
      expiry: parseExpiry(m[4]!),
      qty: m[5] ? parseInt(m[5]) : 1,
    };
  });
}

// ===================== IBKR SECDEF / CHAIN =====================

interface SecDefResult {
  conid: number;
  symbol: string;
  secType: string;
  exchange: string;
  listingExchange?: string;
  sections?: Array<{ secType: string; exchange?: string; conid?: string }>;
}

interface StrikesResult {
  call: number[];
  put: number[];
}

async function getUnderlyingConid(ticker: string): Promise<number> {
  const results = await ibkrGet<SecDefResult[]>(
    `/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(ticker)}&sectype=STK`
  );
  if (!results || results.length === 0) throw new Error(`No contract found for ${ticker}`);

  // Prefer primary listing
  const stock = results.find(r => r.sections?.some(s => s.secType === 'STK'));
  const conid = stock?.conid || results[0]!.conid;
  return conid;
}

async function getOptionConid(
  underlyingConid: number,
  expiry: string,
  strike: number,
  right: 'C' | 'P'
): Promise<number | null> {
  // Use secdef/info to get specific option contract
  const params = new URLSearchParams({
    conid: String(underlyingConid),
    sectype: 'OPT',
    month: expiry.slice(0, 6), // YYYYMM
    right: right,
    strike: String(strike),
    exchange: '',
  });

  try {
    const results = await ibkrGet<any[]>(
      `/v1/api/iserver/secdef/info?${params}`
    );
    if (results && results.length > 0) {
      // Find exact match
      const match = results.find((r: any) =>
        r.maturityDate === expiry &&
        Math.abs(parseFloat(r.strike) - strike) < 0.01 &&
        r.right === right
      );
      return match?.conid || results[0]?.conid || null;
    }
  } catch (err) {
    console.error(`  Failed to find option ${strike}${right} ${expiry}:`, err instanceof Error ? err.message : String(err));
  }
  return null;
}

// ===================== MARKET DATA =====================

interface MarketDataSnapshot {
  conid: number;
  '31'?: string; // last
  '84'?: string; // bid
  '86'?: string; // ask
  '7283'?: string; // IV
  '7633'?: string; // IV at strike
  [key: string]: any;
}

async function getMarketDataSnapshot(conids: number[]): Promise<MarketDataSnapshot[]> {
  // Request fields: 31=last, 84=bid, 86=ask, 7283=IV
  const fields = '31,84,86,7283';
  const results = await ibkrGet<MarketDataSnapshot[]>(
    `/v1/api/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=${fields}`
  );

  // IBKR often needs a second request to populate data
  await new Promise(r => setTimeout(r, 1500));

  const retry = await ibkrGet<MarketDataSnapshot[]>(
    `/v1/api/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=${fields}`
  );

  return retry || results;
}

function parsePrice(val: string | undefined): number | null {
  if (!val) return null;
  // IBKR sometimes prefixes with C/H for close/halted
  const cleaned = val.replace(/^[A-Z]/, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ===================== FORMAT HELPERS =====================

const pad = (s: string, n: number) => s.padEnd(n);
const rpad = (s: string, n: number) => s.padStart(n);

// ===================== MAIN =====================

async function main() {
  const args = process.argv.slice(2);
  const tickerIdx = args.indexOf('--ticker');
  const legsIdx = args.indexOf('--legs');

  if (tickerIdx < 0 || legsIdx < 0) {
    console.error('Usage: npx tsx scripts/ibkr-option-quote.ts --ticker IBIT --legs "BUY 49C Aug21, SELL 60C Aug21 x2, BUY 55C Aug21, SELL 36P Aug21"');
    process.exit(1);
  }

  const ticker = args[tickerIdx + 1]!.toUpperCase();
  const legsStr = args[legsIdx + 1]!;
  const legs = parseLegs(legsStr);

  console.log(`\nIBKR Live Quote: ${ticker}`);
  console.log(`Legs: ${legs.length}`);
  for (const l of legs) {
    console.log(`  ${l.action} ${l.qty}x ${l.strike}${l.right} ${l.expiry}`);
  }

  // Step 1: Verify gateway
  console.log('\nConnecting to IBKR Gateway...');
  try {
    await ibkrGet('/v1/api/tickle');
    console.log('  Gateway: connected');
  } catch (err) {
    console.error('  Gateway not available:', err instanceof Error ? err.message : String(err));
    console.error('  Make sure IBKR Client Portal Gateway is running and authenticated');
    process.exit(1);
  }

  // Step 2: Get underlying conid
  console.log(`\nResolving ${ticker} contract...`);
  const underlyingConid = await getUnderlyingConid(ticker);
  console.log(`  Underlying conid: ${underlyingConid}`);

  // Step 3: Resolve each leg's option conid
  console.log('\nResolving option contracts...');
  const legConids: Array<{ leg: ParsedLeg; conid: number | null }> = [];

  for (const leg of legs) {
    const conid = await getOptionConid(underlyingConid, leg.expiry, leg.strike, leg.right);
    legConids.push({ leg, conid });
    console.log(`  ${leg.action} ${leg.qty}x ${leg.strike}${leg.right} ${leg.expiry}: conid=${conid || 'NOT FOUND'}`);
  }

  const validConids = legConids.filter(lc => lc.conid !== null);
  if (validConids.length === 0) {
    console.error('\nNo option contracts could be resolved. Check expiry format (YYYYMMDD).');
    process.exit(1);
  }

  // Step 4: Fetch market data
  console.log('\nFetching live quotes...');
  const conidList = [...new Set(validConids.map(lc => lc.conid!))];
  const snapshots = await getMarketDataSnapshot(conidList);
  const snapMap = new Map(snapshots.map(s => [s.conid, s]));

  // Step 5: Display results
  console.log('\n' + '='.repeat(90));
  console.log(`IBKR LIVE QUOTES: ${ticker}`);
  console.log('='.repeat(90));
  console.log('Leg    Strike   Type  Expiry          Bid      Ask      Mid     Last       IV');
  console.log('-'.repeat(90));

  let netBid = 0; // to BUY the combo
  let netAsk = 0;
  let netMid = 0;

  for (const { leg, conid } of legConids) {
    if (!conid) {
      console.log(`${pad(leg.action, 6)} ${leg.strike}${leg.right}     —     ${pad(leg.expiry, 10)} ${rpad('N/A', 8)} ${rpad('N/A', 8)} ${rpad('N/A', 8)} ${rpad('N/A', 8)}`);
      continue;
    }

    const snap = snapMap.get(conid);
    const bid = parsePrice(snap?.['84']);
    const ask = parsePrice(snap?.['86']);
    const last = parsePrice(snap?.['31']);
    const iv = parsePrice(snap?.['7283']);
    const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null;

    const sign = leg.action === 'BUY' ? 1 : -1;
    const qty = leg.qty;

    // Combo pricing: to BUY combo, pay ask on buys, receive bid on sells
    if (bid !== null && ask !== null) {
      if (leg.action === 'BUY') {
        netAsk += ask * qty;  // pay ask
        netBid += bid * qty;  // could sell at bid
      } else {
        netAsk -= bid * qty;  // receive bid when selling
        netBid -= ask * qty;  // would pay ask to buy back
      }
      netMid += sign * mid! * qty;
    }

    const bidStr = bid !== null ? `$${bid.toFixed(2)}` : '—';
    const askStr = ask !== null ? `$${ask.toFixed(2)}` : '—';
    const midStr = mid !== null ? `$${mid.toFixed(2)}` : '—';
    const lastStr = last !== null ? `$${last.toFixed(2)}` : '—';
    const ivStr = iv !== null ? `${(iv * 100).toFixed(1)}%` : '—';
    const qtyStr = qty > 1 ? `x${qty}` : '  ';

    console.log(`${pad(leg.action, 6)} ${leg.strike}${leg.right}${qtyStr}         ${pad(leg.expiry, 10)} ${rpad(bidStr, 8)} ${rpad(askStr, 8)} ${rpad(midStr, 8)} ${rpad(lastStr, 8)} ${rpad(ivStr, 8)}`);
  }

  console.log('-'.repeat(90));
  console.log(`COMBO                              ${rpad('$' + netBid.toFixed(2), 8)} ${rpad('$' + netAsk.toFixed(2), 8)} ${rpad('$' + netMid.toFixed(2), 8)}`);

  const comboType = netMid > 0 ? 'DEBIT' : 'CREDIT';
  console.log(`\nCombo Net: $${Math.abs(netMid).toFixed(2)} ${comboType} at mid`);
  console.log(`  Bid: $${netBid.toFixed(2)} | Ask: $${netAsk.toFixed(2)} | Spread: $${(netAsk - netBid).toFixed(2)}`);

  if (netMid !== 0) {
    const perContract = Math.abs(netMid) * 100;
    console.log(`  Per contract: $${perContract.toFixed(0)} | 30 contracts: $${(perContract * 30).toFixed(0)}`);
  }

  // Unsubscribe market data
  for (const conid of conidList) {
    try {
      await ibkrGet(`/v1/api/iserver/marketdata/${conid}/unsubscribe`);
    } catch {}
  }
}

main().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
