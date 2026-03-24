/**
 * sync-tv-drawings.ts
 *
 * Reads TradingView chart drawings from the Price/BTC layout via Chrome CDP,
 * then upserts them as strategy price signals in the database.
 *
 * Consolidation model: ONE signal per underlying ticker, with all TP/SL
 * targets stored in a `targets` array inside explicit_details.
 *
 * Drawing label convention:
 *   TP1 [N%]  → take-profit target (price_above)
 *   TP2 [N%]  → take-profit target (price_above)
 *   TP3 [N%]  → take-profit target (price_above)
 *   SL  [N%]  → stop-loss target (price_below)
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

const { signals, strategies, assetTheses, underlyings, signalEntityLinks, journalEntries } = schema;

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
  signalType: 'confirmation' | 'invalidation';
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

  let signalType: 'confirmation' | 'invalidation';
  let conditionType: 'price_above' | 'price_below';
  let positionPct: number | null = null;

  const tpMatch = TP_PATTERN.exec(label);
  const slMatch = SL_PATTERN.exec(label);

  if (tpMatch) {
    signalType = 'confirmation';
    conditionType = 'price_above';
    if (tpMatch[2]) positionPct = parseInt(tpMatch[2], 10);
  } else if (slMatch) {
    signalType = 'invalidation';
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

interface TargetEntry {
  label: string;
  price: number;
  denomination: 'BTC' | 'USD';
  positionPct: number | null;
  conditionType: 'price_above' | 'price_below';
  tvDrawingId: string;
  tvSymbol: string;
  serverUpdateTime: number;
  status: 'active' | 'complete';
}

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

/** Find existing consolidated ladder signal for a ticker */
async function findLadderSignal(ticker: string): Promise<{ id: string; explicitDetails: Record<string, unknown> } | null> {
  const rows = await db
    .select({ id: signals.id, explicitDetails: signals.explicitDetails })
    .from(signals)
    .where(and(
      sql`explicit_details->>'signalKind' = 'strategy_price_ladder'`,
      sql`explicit_details->>'ticker' = ${ticker}`,
      eq(signals.status, 'active'),
    ))
    .limit(1);
  return rows[0] ? { id: rows[0].id, explicitDetails: rows[0].explicitDetails as Record<string, unknown> } : null;
}

function formatPrice(price: number, denomination: 'BTC' | 'USD'): string {
  if (denomination === 'USD') {
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  return price.toPrecision(6);
}

function buildLadderStatement(ticker: string, targets: TargetEntry[]): string {
  const usdTargets = targets
    .filter(t => t.denomination === 'USD' && t.conditionType === 'price_above')
    .sort((a, b) => a.price - b.price);
  const btcTargets = targets
    .filter(t => t.denomination === 'BTC' && t.conditionType === 'price_above')
    .sort((a, b) => a.price - b.price);
  const slTargets = targets.filter(t => t.conditionType === 'price_below');

  const parts: string[] = [];

  if (usdTargets.length > 0) {
    const prices = usdTargets.map(t => `$${t.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
    parts.push(prices.join(' / '));
  }

  if (btcTargets.length > 0) {
    const prices = btcTargets.map(t => t.price.toPrecision(4));
    parts.push(prices.join(' / ') + ' BTC');
  }

  const base = `${ticker} take-profit ladder: ${parts.join(', ')}`;
  if (slTargets.length > 0) {
    const slStr = slTargets.map(t => formatPrice(t.price, t.denomination)).join(', ');
    return `${base} (SL: ${slStr})`;
  }
  return base;
}

function drawingsToTargets(drawings: ParsedDrawing[]): TargetEntry[] {
  return drawings.map(d => ({
    label: d.label,
    price: d.price,
    denomination: d.denomination,
    positionPct: d.positionPct,
    conditionType: d.conditionType,
    tvDrawingId: d.tvDrawingId,
    tvSymbol: d.tvSymbol,
    serverUpdateTime: d.serverUpdateTime,
    status: 'active' as const,
  }));
}

function targetsChanged(existing: TargetEntry[], incoming: TargetEntry[]): boolean {
  if (existing.length !== incoming.length) return true;
  // Compare by tvDrawingId + price
  const existingMap = new Map(existing.map(t => [t.tvDrawingId, t.price]));
  for (const t of incoming) {
    const oldPrice = existingMap.get(t.tvDrawingId);
    if (oldPrice === undefined || oldPrice !== t.price) return true;
  }
  return false;
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

  // Group by ticker — one consolidated signal per ticker
  const byTicker: Record<string, ParsedDrawing[]> = {};
  for (const d of parsed) {
    if (!byTicker[d.baseTicker]) byTicker[d.baseTicker] = [];
    byTicker[d.baseTicker].push(d);
  }

  let created = 0, updated = 0, skipped = 0, noStrategy = 0, linksCreated = 0;

  for (const [ticker, drawings] of Object.entries(byTicker)) {
    console.log(`  ${ticker} (${drawings.length} drawings)`);

    const matchedStrategies = await findStrategiesForTicker(ticker);
    if (matchedStrategies.length === 0) {
      console.log(`    ⚠ No active strategies found for ${ticker} — skipping`);
      noStrategy += drawings.length;
      continue;
    }

    // Build targets array from all drawings for this ticker
    const incomingTargets = drawingsToTargets(drawings);
    // Sort: USD TP ascending, then BTC TP ascending, then SL
    incomingTargets.sort((a, b) => {
      if (a.conditionType !== b.conditionType) return a.conditionType === 'price_above' ? -1 : 1;
      if (a.denomination !== b.denomination) return a.denomination === 'USD' ? -1 : 1;
      return a.price - b.price;
    });

    for (const t of incomingTargets) {
      const tag = t.denomination === 'USD' ? ' [USD]' : ' [BTC]';
      console.log(`    ${t.label}${tag} @ ${formatPrice(t.price, t.denomination)}${t.positionPct ? ` (${t.positionPct}%)` : ''}`);
    }

    // Find or create the consolidated signal
    const existing = await findLadderSignal(ticker);

    if (existing) {
      const oldTargets = (existing.explicitDetails.targets as TargetEntry[]) || [];
      // Preserve per-target status from existing (e.g. if TP1 was marked 'complete')
      for (const t of incomingTargets) {
        const prev = oldTargets.find(o => o.tvDrawingId === t.tvDrawingId);
        if (prev?.status === 'complete') t.status = 'complete';
      }

      if (!targetsChanged(oldTargets, incomingTargets)) {
        console.log(`    · No changes to ${ticker} ladder — skipping`);
        skipped++;
      } else {
        const statement = buildLadderStatement(ticker, incomingTargets);
        const explicitDetails = {
          ...existing.explicitDetails,
          targets: incomingTargets,
          tvLayoutId: TV_LAYOUT_ID,
        };
        console.log(`    ↑ Updating ${ticker} ladder signal`);
        if (!DRY_RUN) {
          await db.update(signals)
            .set({ explicitDetails, statement, updatedAt: new Date() })
            .where(eq(signals.id, existing.id));
        }
        updated++;
      }

      // Ensure strategy links exist
      for (const strategy of matchedStrategies) {
        if (!DRY_RUN) {
          const linkResult = await db.insert(signalEntityLinks).values({
            signalId: existing.id,
            entityType: 'strategy',
            strategyId: strategy.id,
          }).onConflictDoNothing();
          if (linkResult.rowCount && linkResult.rowCount > 0) {
            console.log(`      → linked to ${strategy.strategyKey}`);
            linksCreated++;
          }
        }
      }
    } else {
      // Create new consolidated signal
      const statement = buildLadderStatement(ticker, incomingTargets);
      const explicitDetails = {
        signalKind: 'strategy_price_ladder',
        ticker,
        targets: incomingTargets,
        tvLayoutId: TV_LAYOUT_ID,
      };

      console.log(`    + Creating ${ticker} ladder signal`);
      if (!DRY_RUN) {
        const [inserted] = await db.insert(signals).values({
          type: 'confirmation',
          statement,
          category: 'data_driven',
          importance: 'significant',
          status: 'active',
          explicitDetails,
          linkedClaimIds: [],
        }).returning({ id: signals.id });

        await db.insert(journalEntries).values({
          objectType: 'signal',
          objectId: inserted.id,
          objectTitle: statement,
          actionType: 'created',
          actionDescription: `Strategy price ladder created for ${ticker} with ${incomingTargets.length} targets`,
          source: 'automation',
        });

        // Create strategy links
        for (const strategy of matchedStrategies) {
          const linkResult = await db.insert(signalEntityLinks).values({
            signalId: inserted.id,
            entityType: 'strategy',
            strategyId: strategy.id,
          }).onConflictDoNothing();
          if (linkResult.rowCount && linkResult.rowCount > 0) {
            console.log(`      → linked to ${strategy.strategyKey}`);
            linksCreated++;
          }
        }
      }
      created++;
    }
    console.log('');
  }

  console.log('─'.repeat(40));
  console.log(`  Signals — Created: ${created}  Updated: ${updated}  Skipped: ${skipped}  No strategy: ${noStrategy}`);
  console.log(`  Links created: ${linksCreated}`);
  if (DRY_RUN) console.log('  (dry run — no changes written)');

  await closeDb();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
