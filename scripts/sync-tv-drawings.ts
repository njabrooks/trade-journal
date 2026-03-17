/**
 * sync-tv-drawings.ts
 *
 * Reads TradingView chart drawings from the Price/BTC layout via Chrome CDP,
 * then upserts them as strategy price signals in the database.
 *
 * Drawing label convention:
 *   TP1 [N%]  → confirmation signal, price_above condition
 *   TP2 [N%]  → confirmation signal, price_above condition
 *   TP3 [N%]  → confirmation signal, price_above condition
 *   SL  [N%]  → warning signal, price_below condition
 *
 * Two drawing sources are read from the Price/BTC layout:
 *   - /layout/{uid}/sources  → indicator panel drawings (BTC-ratio prices)
 *   - /user/sources?symbol=  → main-series drawings per symbol (USD prices)
 *
 * Configure which symbols to read USD drawings for:
 *   TV_USD_SYMBOLS=CRYPTO:HYPEHUSD,NASDAQ:GLXY,CRYPTO:BTCUSD
 *
 * Usage:
 *   npx tsx scripts/sync-tv-drawings.ts [--dry-run]
 */

import WebSocket from 'ws';
import { db, closeDb, schema } from './lib/db.js';
import { eq, and, sql } from 'drizzle-orm';

const { signals, strategies, assetTheses, underlyings } = schema;

// ── Config ─────────────────────────────────────────────────────────────────

const CDP_HOST = 'localhost:9222';
const TV_LAYOUT_ID = process.env.TV_PRICE_LAYOUT_ID || 'Fyx6k9NR';
const TV_USER_ID = process.env.TV_USER_ID || '3434584';
const DRY_RUN = process.argv.includes('--dry-run');

// Comma-separated TradingView symbols to query for USD main-series drawings
// e.g. TV_USD_SYMBOLS=CRYPTO:HYPEHUSD,NASDAQ:GLXY,CRYPTO:BTCUSD
const TV_USD_SYMBOLS = (process.env.TV_USD_SYMBOLS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Label patterns we recognise
const TP_PATTERN = /^(TP[1-9])\s*(\d+)?%?/i;
const SL_PATTERN = /^(SL)\s*(\d+)?%?/i;

// ── CDP client ──────────────────────────────────────────────────────────────

interface CDPMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
}

function connectCDP(wsUrl: string): Promise<{
  evaluate: (expression: string) => Promise<unknown>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

    ws.on('open', () => {
      // Enable Runtime domain
      const id = msgId++;
      ws.send(JSON.stringify({ id, method: 'Runtime.enable', params: {} }));
      pending.set(id, {
        resolve: () => {
          resolve({
            evaluate: (expression: string) => new Promise((res, rej) => {
              const evalId = msgId++;
              ws.send(JSON.stringify({
                id: evalId,
                method: 'Runtime.evaluate',
                params: {
                  expression,
                  awaitPromise: true,
                  returnByValue: true,
                  timeout: 15000,
                },
              }));
              pending.set(evalId, { resolve: res, reject: rej });
            }),
            close: () => ws.close(),
          });
        },
        reject: () => reject(new Error('Runtime.enable failed')),
      });
    });

    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as CDPMessage;
      if (msg.id && pending.has(msg.id)) {
        const handler = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.error) {
          handler.reject(new Error(msg.error.message));
        } else {
          handler.resolve(msg.result);
        }
      }
    });

    ws.on('error', reject);
    ws.on('close', () => {
      for (const h of pending.values()) h.reject(new Error('CDP WebSocket closed'));
      pending.clear();
    });
  });
}

// ── TradingView API (runs inside browser via CDP) ───────────────────────────

interface TVDrawing {
  id: string;
  symbol: string;
  serverUpdateTime: number;
  state: {
    type: string;
    state: {
      text: string;
      symbol: string;
      visible: boolean;
    };
    points: Array<{ price: number; time_t: number }>;
  };
}

interface TaggedDrawing extends TVDrawing {
  _denomination: 'BTC' | 'USD';
}

type CDPClient = { evaluate: (expression: string) => Promise<unknown>; close: () => void };

async function getJWT(cdp: CDPClient): Promise<string> {
  const result = await cdp.evaluate(`
    fetch('https://www.tradingview.com/chart-token/?image_url=${TV_LAYOUT_ID}&user_id=${TV_USER_ID}', {
      credentials: 'include'
    }).then(r => r.json()).then(d => JSON.stringify(d))
  `) as { result: { value: string } };

  const data = JSON.parse(result.result.value) as { token?: string };
  if (!data.token) throw new Error('No JWT token returned from chart-token endpoint');
  return data.token;
}

async function fetchLayoutDrawings(cdp: CDPClient, jwt: string): Promise<TVDrawing[]> {
  const result = await cdp.evaluate(`
    fetch('https://charts-storage.tradingview.com/charts-storage/get/layout/${TV_LAYOUT_ID}/sources?chart_id=1&layout_id=${TV_LAYOUT_ID}&jwt=${jwt}', {
      credentials: 'include'
    }).then(r => r.json()).then(d => JSON.stringify(d))
  `) as { result: { value: string } };

  const data = JSON.parse(result.result.value) as {
    success: boolean;
    payload?: { sources: Record<string, TVDrawing> };
  };

  if (!data.success || !data.payload?.sources) {
    throw new Error('Layout sources API returned unsuccessful response');
  }

  return Object.values(data.payload.sources);
}

async function fetchUserSourceDrawings(cdp: CDPClient, jwt: string, tvSymbol: string): Promise<TVDrawing[]> {
  const encodedSymbol = encodeURIComponent(tvSymbol);
  const result = await cdp.evaluate(`
    fetch('https://charts-storage.tradingview.com/charts-storage/get/user/sources?layout_id=${TV_LAYOUT_ID}&jwt=${jwt}&symbol=${encodedSymbol}&brokerName=', {
      credentials: 'include'
    }).then(r => r.json()).then(d => JSON.stringify(d))
  `) as { result: { value: string } };

  const data = JSON.parse(result.result.value) as {
    success: boolean;
    payload?: { sources: Record<string, TVDrawing> };
  };

  if (!data.success) {
    console.log(`    ⚠ User sources API returned unsuccessful for ${tvSymbol} — skipping`);
    return [];
  }

  if (!data.payload?.sources) return [];
  return Object.values(data.payload.sources);
}

async function fetchAllDrawings(wsUrl: string, usdSymbols: string[]): Promise<TaggedDrawing[]> {
  const cdp = await connectCDP(wsUrl);
  try {
    const jwt = await getJWT(cdp);

    // BTC-ratio indicator drawings from study panel
    const btcDrawings = await fetchLayoutDrawings(cdp, jwt);
    const tagged: TaggedDrawing[] = btcDrawings.map(d => ({ ...d, _denomination: 'BTC' as const }));

    // USD main-series drawings per symbol
    if (usdSymbols.length > 0) {
      for (const symbol of usdSymbols) {
        const drawings = await fetchUserSourceDrawings(cdp, jwt, symbol);
        for (const d of drawings) {
          tagged.push({ ...d, _denomination: 'USD' as const });
        }
      }
    }

    return tagged;
  } finally {
    cdp.close();
  }
}

// ── Drawing parsing ─────────────────────────────────────────────────────────

interface ParsedDrawing {
  tvDrawingId: string;
  tvSymbol: string;          // e.g. NASDAQ:GLXY
  baseTicker: string;        // e.g. GLXY
  label: string;             // e.g. TP1 40%
  signalType: 'confirmation' | 'warning';
  conditionType: 'price_above' | 'price_below';
  price: number;
  positionPct: number | null;
  denomination: 'BTC' | 'USD';
  serverUpdateTime: number;
}

function extractTicker(tvSymbol: string): string {
  // NASDAQ:GLXY → GLXY, CRYPTO:HYPEHUSD → HYPE, COINBASE:ETHUSD → ETH
  const parts = tvSymbol.split(':');
  const raw = parts[parts.length - 1];
  // Strip common quote currencies from crypto pairs
  return raw.replace(/(HUSD|USD|BTC|ETH|USDT|USDC)$/, '') || raw;
}

function parseDrawing(drawing: TaggedDrawing): ParsedDrawing | null {
  const label = drawing.state?.state?.text?.trim();
  const price = drawing.state?.points?.[0]?.price;
  const tvSymbol = drawing.symbol || drawing.state?.state?.symbol;

  if (!label || price == null || !tvSymbol) return null;
  if (!drawing.state?.state?.visible) return null; // skip hidden drawings
  if (drawing.state.type !== 'LineToolHorzRay') return null;

  let signalType: 'confirmation' | 'warning';
  let conditionType: 'price_above' | 'price_below';
  let positionPct: number | null = null;

  const tpMatch = TP_PATTERN.exec(label);
  const slMatch = SL_PATTERN.exec(label);

  if (tpMatch) {
    signalType = 'confirmation';
    conditionType = 'price_above';
    if (tpMatch[2]) positionPct = parseInt(tpMatch[2], 10);
  } else if (slMatch) {
    signalType = 'warning';
    conditionType = 'price_below';
    if (slMatch[2]) positionPct = parseInt(slMatch[2], 10);
  } else {
    return null; // not a TP/SL drawing
  }

  return {
    tvDrawingId: drawing.id,
    tvSymbol,
    baseTicker: extractTicker(tvSymbol),
    label,
    signalType,
    conditionType,
    price,
    positionPct,
    denomination: drawing._denomination,
    serverUpdateTime: drawing.serverUpdateTime,
  };
}

// ── DB helpers ──────────────────────────────────────────────────────────────

async function findStrategiesForTicker(ticker: string): Promise<Array<{ id: string; strategyKey: string }>> {
  const rows = await db
    .select({ id: strategies.id, strategyKey: strategies.strategyKey })
    .from(strategies)
    .innerJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
    .innerJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(and(
      eq(underlyings.ticker, ticker.toUpperCase()),
      eq(strategies.status, 'active'),
    ));
  return rows;
}

async function findExistingSignal(tvDrawingId: string, strategyId: string): Promise<{ id: string; explicitDetails: unknown } | null> {
  const rows = await db
    .select({ id: signals.id, explicitDetails: signals.explicitDetails })
    .from(signals)
    .where(and(
      eq(signals.entityType, 'strategy'),
      eq(signals.strategyId, strategyId),
      sql`explicit_details->>'tvDrawingId' = ${tvDrawingId}`,
    ))
    .limit(1);
  return rows[0] ?? null;
}

function formatPrice(price: number, denomination: 'BTC' | 'USD'): string {
  if (denomination === 'USD') {
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  return price.toPrecision(6);
}

function buildStatement(drawing: ParsedDrawing): string {
  const pctStr = drawing.positionPct ? ` (${drawing.positionPct}% of position)` : '';
  const priceStr = formatPrice(drawing.price, drawing.denomination);
  const suffix = drawing.denomination === 'USD' ? '' : '/BTC';

  if (drawing.signalType === 'confirmation') {
    return `Take profit when ${drawing.baseTicker}${suffix} > ${priceStr}${pctStr}`;
  }
  return `Stop loss when ${drawing.baseTicker}${suffix} < ${priceStr}${pctStr}`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📡 sync-tv-drawings — layout ${TV_LAYOUT_ID}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  if (TV_USD_SYMBOLS.length === 0) {
    console.log('  ℹ No TV_USD_SYMBOLS configured — only BTC-ratio indicator drawings will be read.');
    console.log('  Set TV_USD_SYMBOLS=CRYPTO:HYPEHUSD,NASDAQ:GLXY,CRYPTO:BTCUSD to include USD drawings.\n');
  } else {
    console.log(`  USD symbols: ${TV_USD_SYMBOLS.join(', ')}\n`);
  }

  // Find TradingView tab
  const tabsRes = await fetch(`http://${CDP_HOST}/json`);
  const tabs = await tabsRes.json() as Array<{ url: string; webSocketDebuggerUrl: string; title: string }>;
  const tvTab = tabs.find(t => t.url.includes('tradingview.com') && t.webSocketDebuggerUrl);
  if (!tvTab) throw new Error('No TradingView tab found on CDP port 9222');
  console.log(`  ✓ TradingView tab: ${tvTab.title}`);

  // Fetch all drawings (BTC indicator + USD main-series)
  console.log(`  Fetching drawings from layout ${TV_LAYOUT_ID}...`);
  const allDrawings = await fetchAllDrawings(tvTab.webSocketDebuggerUrl, TV_USD_SYMBOLS);
  const btcCount = allDrawings.filter(d => d._denomination === 'BTC').length;
  const usdCount = allDrawings.filter(d => d._denomination === 'USD').length;
  console.log(`  ✓ ${allDrawings.length} total drawings fetched (${btcCount} BTC indicator, ${usdCount} USD main-series)`);

  // Parse — only TP/SL labelled drawings
  const parsed = allDrawings.flatMap(d => {
    const p = parseDrawing(d);
    return p ? [p] : [];
  });
  console.log(`  ✓ ${parsed.length} TP/SL drawings found\n`);

  if (parsed.length === 0) {
    console.log('  No TP/SL drawings to process. Ensure drawings are labelled TP1, TP2, TP3, or SL.');
    return;
  }

  // Group by ticker for display
  const byTicker: Record<string, ParsedDrawing[]> = {};
  for (const d of parsed) {
    if (!byTicker[d.baseTicker]) byTicker[d.baseTicker] = [];
    byTicker[d.baseTicker].push(d);
  }

  let created = 0, updated = 0, skipped = 0, noStrategy = 0;

  for (const [ticker, drawings] of Object.entries(byTicker)) {
    console.log(`  ${ticker} (${drawings.length} drawings)`);

    const matchedStrategies = await findStrategiesForTicker(ticker);
    if (matchedStrategies.length === 0) {
      console.log(`    ⚠ No active strategies found for ${ticker} — skipping`);
      noStrategy += drawings.length;
      continue;
    }

    for (const drawing of drawings) {
      for (const strategy of matchedStrategies) {
        const existing = await findExistingSignal(drawing.tvDrawingId, strategy.id);
        const explicitDetails = {
          conditionType: drawing.conditionType,
          price: drawing.price,
          positionPct: drawing.positionPct,
          tvLabel: drawing.label,
          tvDrawingId: drawing.tvDrawingId,
          tvSymbol: drawing.tvSymbol,
          denomination: drawing.denomination,
          tvLayoutId: TV_LAYOUT_ID,
          serverUpdateTime: drawing.serverUpdateTime,
        };

        const denomTag = drawing.denomination === 'USD' ? ' [USD]' : ' [BTC]';

        if (existing) {
          const existingDetails = existing.explicitDetails as Record<string, unknown>;
          const priceChanged = existingDetails.price !== drawing.price;
          if (!priceChanged) {
            console.log(`    · ${drawing.label}${denomTag} @ ${formatPrice(drawing.price, drawing.denomination)} — unchanged`);
            skipped++;
            continue;
          }

          console.log(`    ↑ ${drawing.label}${denomTag} @ ${formatPrice(drawing.price, drawing.denomination)} — price updated (${strategy.strategyKey})`);
          if (!DRY_RUN) {
            await db.update(signals)
              .set({ explicitDetails, statement: buildStatement(drawing), updatedAt: new Date() })
              .where(eq(signals.id, existing.id));
          }
          updated++;
        } else {
          console.log(`    + ${drawing.label}${denomTag} @ ${formatPrice(drawing.price, drawing.denomination)} — creating signal for ${strategy.strategyKey}`);
          if (!DRY_RUN) {
            await db.insert(signals).values({
              entityType: 'strategy',
              strategyId: strategy.id,
              type: drawing.signalType,
              statement: buildStatement(drawing),
              category: 'data_driven',
              importance: drawing.signalType === 'warning' ? 'critical' : 'significant',
              status: 'active',
              explicitDetails,
              linkedClaimIds: [],
            });
          }
          created++;
        }
      }
    }
    console.log('');
  }

  console.log('─'.repeat(40));
  console.log(`  Created: ${created}  Updated: ${updated}  Skipped: ${skipped}  No strategy: ${noStrategy}`);
  if (DRY_RUN) console.log('  (dry run — no changes written)');

  await closeDb();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
