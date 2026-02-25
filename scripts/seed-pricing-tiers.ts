/**
 * Seed pricing_tier classification on the assets table.
 *
 * Classification rules (ported from TTC isPriceable() + apply-proxy-prices.ts):
 *   zero       — NFTs, Solana addresses, dead tokens
 *   book_value — LP tokens, yield tokens, obscure DeFi
 *   proxy      — Wrapped/bridged tokens with a known market equivalent
 *   market     — Everything else with fetchable prices (crypto, equity, ETF, etc.)
 *
 * Usage:
 *   npx tsx scripts/seed-pricing-tiers.ts [--dry-run]
 */

import { db, closeDb, schema } from './lib/db.js';
import { sql } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');

// --- Classification patterns ---

// Proxy mappings: ticker → proxy target ticker
const PROXY_MAPPINGS: Record<string, string> = {
  WBTC: 'BTC',
  CBBTC: 'BTC', // Coinbase Wrapped BTC
  STETH: 'ETH',
  WETH: 'ETH',
  MSOL: 'SOL',
  HSOL: 'SOL',
  WMEMO: 'MEMO',
  BWETH: 'ETH',
  BWBTC: 'BTC',
  BAVAX: 'AVAX',
  TUSOL: 'SOL',
  // Yield/staked tokens with liquid proxy targets
  SSPELL: 'SPELL',
  CVXCRV: 'CRV',
  CVXFXS: 'FXS',
  RBASIS: 'BASIS',
};

// Stablecoin proxy tokens (priced at $1 via manual source — classify as market)
// Note: BDAI, BMIM, BUSDT, BUSDC, USDC.E, USDT.E moved to FORCE_ZERO (all disposed)
const STABLECOIN_PROXIES: string[] = [];

// LP token substrings
const LP_SUBSTRINGS = ['-SOL', '-USDC', '-USDT', '-RAY', '-ETH', 'LP-', 'MIM-3LP', 'GAUGE', 'PLP', 'JLP', 'XJOE'];

// Yield token prefixes (that aren't proxy-mapped above)
const YIELD_PREFIXES = ['YV', 'CVXFXS', 'CVXCRV', 'RBASIS', 'SSPELL'];

// Tokens that look like wrapped/yield but are actually tradeable
const OVERRIDE_PRICEABLE = new Set(['CVX', 'BTC', 'BABY', 'YFI']);

// Dead/disposed assets that should never be reclassified back to market.
// These were identified in M4.5a audit (2026-02-20) and confirmed as:
// - Fully disposed (sell events confirmed in events/trades tables)
// - Worthless (protocol collapsed, token dead, dust amounts)
// - Matured (bonds)
const FORCE_ZERO = new Set([
  // Matured bonds
  '912796YN3', '912796ZF9', '912796ZG7', '912796YH6',
  '912796ZD4', '912796YT0', '912796XQ7', 'COIN 3 3/8 10/01/28 8AA8',
  // Disposed TTC crypto
  'AI16Z', 'LOOKS', 'SLERF', 'OGV', 'MET', 'JOOD', 'COST', 'DOOD', 'AIXBT',
  // Disposed Nick crypto
  'YAK', 'TULIP', 'MEDIA', 'RLY', 'IBEUR', 'PENGU', 'SLND', 'COPE',
  // Dead/worthless crypto
  'UST', 'AUST', 'AVAPAY', 'ICE', 'BASIS', 'BLUNA', 'BLZZ',
  // Crypto dust
  'GEL', 'MAPS', 'MARS', 'JOE', 'MEMO', 'NICE',
  'FTT', 'BLINK', 'ST-YCRV', 'STKCVXCRV', 'BCRV', 'BAAVE',
  'CNC', 'FLX', 'SDT', 'SONAR', 'TRIBE', 'LUNC', 'ANGLE',
  'APOLLO', 'ASTROC', 'SDFXS', 'DYP', 'ETHW', 'OXY',
  'MATIC', 'BNB', 'CRVUSD', 'BTUSD', 'BDAI', 'BOME',
  // Disposed stablecoins/bridged
  'TUSD', 'USDD', 'FRAX', 'BMIM', 'BUSDC', 'BUSDT', 'USDT.E', 'USDC.E',
  // Dead DeFi
  'CLEV', 'PRISMA', 'JPEG', 'CRV3CRYPTO', 'GRO', 'VKR',
  'ANC', 'MINE', 'NANA', 'INU', 'OOGI', 'GRAPE', 'MER',
  // Disposed IBKR equities (no longer in positions)
  'QQQ', 'GDXJ', 'SMT', 'RIGD', 'TLT', 'SPY', 'AAPL',
  'ROBO', 'BBH', 'SMH', 'IVOL', 'KRBN', 'METV', 'FXY',
  'CCJ', 'ITB', 'EWP', 'EURN', 'GREK', 'EEM', 'NLY',
  'VNQ', 'EWW', 'EWG', 'EWI', 'XLU', 'UUP', 'XLP',
  'VWO', 'DFRG', '2840', 'COW', 'TFI', 'SHY',
  'SRUUF', 'TECK', 'NEM', 'MRNA', 'VLO', 'CTRA', 'ARKK',
  'GBTC', 'ETHE', 'ETH (ETF)', 'MSTR', 'PLTR', 'HOOD', 'URPTF',
  // Zero-balance equities
  'CMCSA', 'GOOG', 'HYG', 'IWM', 'JNK', 'LOW', 'LQDH',
  'USO', 'XLF', 'XLI', 'XLK', 'XRT', 'AMZN', 'DE',
  'DIS', 'HFC', 'IBB', 'CVS',
  // Zero-balance crypto
  '$CWIF', 'JOESHI', 'MANEKI', 'MUMU', 'EURS',
  'ETHRSIAPY', 'YCRV', 'XMARS', 'WAVAX', 'WFTM',
  'LATINA', 'LICKO',
]);

// Stablecoins (already priced at $1 by manual source in price-population.ts)
const STABLECOINS = new Set([
  'USDT', 'USDC', 'DAI', 'BUSD', 'PYUSD', 'TUSD', 'USDP', 'FRAX',
  'GUSD', 'LUSD', 'SUSD', 'CUSD', 'UST', 'USDD', 'EUROC',
]);

function classifyTicker(ticker: string, assetClass: string): 'market' | 'proxy' | 'book_value' | 'zero' {
  const upper = ticker.toUpperCase();

  // Force-zero: dead/disposed/dust assets identified in M4.5a audit
  if (FORCE_ZERO.has(ticker) || FORCE_ZERO.has(upper)) return 'zero';

  // Override priceable — always market
  if (OVERRIDE_PRICEABLE.has(upper)) return 'market';

  // NFTs: contains #digit
  if (/#\d/.test(upper)) return 'zero';

  // Solana addresses: 30+ alphanumeric chars
  if (/^[A-Z0-9]{30,}$/.test(upper)) return 'zero';

  // Proxy-mapped tokens
  if (PROXY_MAPPINGS[upper]) return 'proxy';

  // Stablecoin proxies (BDAI, BMIM, etc.) — market tier, priced at $1
  if (STABLECOIN_PROXIES.includes(upper)) return 'market';

  // LP tokens
  for (const sub of LP_SUBSTRINGS) {
    if (upper.includes(sub)) return 'book_value';
  }

  // Wrapped/bridged suffixes
  if (upper.endsWith('.E')) return 'book_value';

  // Yield token prefixes
  for (const prefix of YIELD_PREFIXES) {
    if (upper.startsWith(prefix) && upper !== prefix) return 'book_value';
  }

  // 3CRV specifically
  if (upper === '3CRV') return 'book_value';

  // Stablecoins and fiat
  if (STABLECOINS.has(upper) || upper === 'USD') return 'market';

  // Non-crypto asset classes → market
  if (['EQUITY', 'ETF', 'BOND', 'COMMODITY', 'MUTUAL_FUND'].includes(assetClass)) return 'market';

  // FIAT → market
  if (assetClass === 'FIAT') return 'market';

  // STABLECOIN class → market
  if (assetClass === 'STABLECOIN') return 'market';

  // Remaining crypto — default to market, gap detection will catch any misses
  if (assetClass === 'CRYPTO') return 'market';

  // Derivatives — IBKR provides daily spot prices via Flex positions
  if (assetClass === 'DERIVATIVE') return 'market';

  // OTHER — book_value as safe default
  return 'book_value';
}

async function main() {
  console.log(`Seeding pricing tiers${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  // Load all assets
  const allAssets = await db
    .select({
      id: schema.assets.id,
      ticker: schema.assets.ticker,
      assetClass: schema.assets.assetClass,
    })
    .from(schema.assets);

  console.log(`Total assets: ${allAssets.length}\n`);

  // Classify each asset
  const classified: Record<string, { id: string; ticker: string; tier: string; proxyTarget?: string }[]> = {
    market: [],
    proxy: [],
    book_value: [],
    zero: [],
  };

  for (const asset of allAssets) {
    const tier = classifyTicker(asset.ticker, asset.assetClass);
    const entry: { id: string; ticker: string; tier: string; proxyTarget?: string } = {
      id: asset.id,
      ticker: asset.ticker,
      tier,
    };
    if (tier === 'proxy') {
      entry.proxyTarget = PROXY_MAPPINGS[asset.ticker.toUpperCase()];
    }
    classified[tier].push(entry);
  }

  // Print summary
  for (const [tier, items] of Object.entries(classified)) {
    console.log(`${tier}: ${items.length} assets`);
    if (items.length <= 20) {
      for (const item of items) {
        const suffix = item.proxyTarget ? ` → ${item.proxyTarget}` : '';
        console.log(`  ${item.ticker}${suffix}`);
      }
    } else {
      for (const item of items.slice(0, 10)) {
        console.log(`  ${item.ticker}`);
      }
      console.log(`  ... and ${items.length - 10} more`);
    }
    console.log('');
  }

  if (DRY_RUN) {
    console.log('Dry run — no changes made.');
    await closeDb();
    process.exit(0);
  }

  // Apply tier classifications in bulk
  // First reset all to NULL
  await db.execute(sql`UPDATE assets SET pricing_tier = NULL, proxy_asset_id = NULL`);

  // Set tiers by ID batches
  for (const [tier, items] of Object.entries(classified)) {
    if (items.length === 0) continue;
    const ids = items.map((i) => i.id);
    // Batch update in chunks of 500
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const idList = chunk.map((id) => `'${id}'`).join(',');
      await db.execute(sql.raw(`
        UPDATE assets SET pricing_tier = '${tier}', updated_at = NOW()
        WHERE id IN (${idList})
      `));
    }
    console.log(`Set ${items.length} assets to '${tier}'`);
  }

  // Set proxy_asset_id for proxy-tier assets
  const proxyItems = classified.proxy;
  if (proxyItems.length > 0) {
    let proxySet = 0;
    let proxyMissing = 0;
    for (const item of proxyItems) {
      if (!item.proxyTarget) continue;
      // Find the proxy target asset by ticker
      const result = await db.execute(sql.raw(`
        UPDATE assets
        SET proxy_asset_id = (SELECT id FROM assets WHERE UPPER(ticker) = '${item.proxyTarget.toUpperCase()}' LIMIT 1)
        WHERE id = '${item.id}'
          AND EXISTS (SELECT 1 FROM assets WHERE UPPER(ticker) = '${item.proxyTarget.toUpperCase()}')
      `));
      // Check if proxy target was found
      const check = await db.execute(sql.raw(`
        SELECT proxy_asset_id FROM assets WHERE id = '${item.id}'
      `));
      if ((check as any)[0]?.proxy_asset_id) {
        proxySet++;
      } else {
        proxyMissing++;
        console.warn(`  WARNING: Proxy target '${item.proxyTarget}' not found for ${item.ticker}`);
      }
    }
    console.log(`Set proxy_asset_id for ${proxySet} assets (${proxyMissing} missing targets)`);
  }

  // Final verification
  const counts = await db.execute(sql`
    SELECT pricing_tier, COUNT(*) as cnt
    FROM assets
    GROUP BY pricing_tier
    ORDER BY cnt DESC
  `);
  console.log('\nFinal distribution:');
  for (const row of counts as any[]) {
    console.log(`  ${row.pricing_tier ?? 'NULL'}: ${row.cnt}`);
  }

  await closeDb();
  console.log('\nDone.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
