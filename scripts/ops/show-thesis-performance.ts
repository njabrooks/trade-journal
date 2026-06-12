/**
 * Print performance attribution for a thesis (W4 session 2 smoke/dev tool).
 *
 * Usage:
 *   npx tsx scripts/ops/show-thesis-performance.ts --asset-thesis <uuid>
 *   npx tsx scripts/ops/show-thesis-performance.ts --macro-thesis <uuid>
 *   npx tsx scripts/ops/show-thesis-performance.ts --overview
 */
import '../lib/db'; // loads .env.local before any src import touches @/db
import {
  getAssetThesisPerformance,
  getMacroThesisPerformance,
  getPerformanceOverview,
} from '../../src/db/queries/thesisPerformance';

async function main() {
  const args = process.argv.slice(2);
  const assetIdx = args.indexOf('--asset-thesis');
  const macroIdx = args.indexOf('--macro-thesis');

  if (args.includes('--overview')) {
    const overview = await getPerformanceOverview();
    console.log(JSON.stringify({
      assetTheses: overview.assetTheses.map((t) => ({
        ticker: t.ticker,
        title: t.title,
        status: t.status,
        strategies: t.strategyCount,
        cumulative: t.latestCumulative,
        realized: t.latestRealized,
        unrealized: t.latestUnrealized,
        confidence: t.confidence,
      })),
      macroTheses: overview.macroTheses.map((t) => ({
        title: t.title,
        status: t.status,
        assetTheses: t.assetThesisCount,
        strategies: t.strategyCount,
        cumulative: t.latestCumulative,
        confidence: t.confidence,
      })),
      retrospectives: overview.retrospectives.length,
    }, null, 2));
    process.exit(0);
  }

  if (assetIdx >= 0) {
    const perf = await getAssetThesisPerformance(args[assetIdx + 1]);
    console.log(JSON.stringify({
      totals: perf.totals,
      strategies: perf.strategies.map((s) => ({
        key: s.strategyKey,
        status: s.status,
        points: s.points.length,
        latest: s.latest,
      })),
      combinedPoints: perf.combined.length,
      combinedLatest: perf.combined[perf.combined.length - 1] ?? null,
    }, null, 2));
  } else if (macroIdx >= 0) {
    const perf = await getMacroThesisPerformance(args[macroIdx + 1]);
    console.log(JSON.stringify({
      attributionNote: perf.attributionNote,
      totals: perf.totals,
      assetTheses: perf.assetTheses,
      strategies: perf.strategies.length,
      combinedPoints: perf.combined.length,
    }, null, 2));
  } else {
    console.error('Pass --asset-thesis <uuid> or --macro-thesis <uuid>');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
