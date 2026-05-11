#!/usr/bin/env tsx
/**
 * Vol Curve CLI — thin wrapper around src/lib/volCurveAnalyzer.ts
 *
 * The actual analysis logic lives in the library. This script just parses
 * CLI flags and prints the resulting AnalysisOutput as JSON to stdout.
 *
 * Same library powers scanner-triggered analyses via
 * /api/vol-curve/analyze-snapshot/[id].
 *
 * Usage:
 *   npx tsx scripts/vol-curve-analyze.ts \
 *     --ticker NVDA \
 *     --direction bullish \
 *     --target-base 250 \
 *     --target-high 300 \
 *     --horizon-months 6 \
 *     --horizon-range 2 \
 *     --downside-floor 160 \
 *     [--risk-free-rate 0.045] \
 *     [--snapshot-date 2026-04-14]
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env.local') });

import { closeDb } from './lib/db.js';
import { analyzeTicker, type AnalyzeOptions } from '../src/lib/volCurveAnalyzer';

function parseArgs(): AnalyzeOptions {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const ticker = get('--ticker');
  const direction = get('--direction') as 'bullish' | 'bearish' | undefined;
  const targetBase = get('--target-base');
  const targetHigh = get('--target-high');
  const horizonMonths = get('--horizon-months');
  const horizonRange = get('--horizon-range');
  const downsideFloor = get('--downside-floor');
  const riskFreeRate = get('--risk-free-rate');
  const snapshotDate = get('--snapshot-date') || null;

  if (!ticker || !direction || !targetBase || !targetHigh || !horizonMonths || !downsideFloor) {
    console.error(`Usage: npx tsx scripts/vol-curve-analyze.ts \\
  --ticker NVDA \\
  --direction bullish \\
  --target-base 250 \\
  --target-high 300 \\
  --horizon-months 6 \\
  --horizon-range 2 \\
  --downside-floor 160 \\
  [--risk-free-rate 0.045] \\
  [--snapshot-date 2026-04-14]`);
    process.exit(1);
  }

  return {
    ticker: ticker.toUpperCase(),
    direction,
    targetBase: parseFloat(targetBase),
    targetHigh: parseFloat(targetHigh),
    horizonMonths: parseFloat(horizonMonths),
    horizonRange: parseFloat(horizonRange || '2'),
    downsideFloor: parseFloat(downsideFloor),
    riskFreeRate: parseFloat(riskFreeRate || '0.045'),
    snapshotDate,
  };
}

async function main() {
  const opts = parseArgs();
  console.error(`\n📊 Vol Curve Analyzer: ${opts.ticker}`);
  console.error(`   Direction: ${opts.direction}`);
  console.error(`   Target: $${opts.targetBase} (base) / $${opts.targetHigh} (high)`);
  console.error(`   Horizon: ${opts.horizonMonths}mo ± ${opts.horizonRange ?? 2}mo`);
  console.error(`   Downside floor: $${opts.downsideFloor}`);

  const output = await analyzeTicker(opts);
  console.log(JSON.stringify(output, null, 2));
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Fatal error:', err instanceof Error ? err.message : String(err));
    await closeDb();
    process.exit(1);
  });
