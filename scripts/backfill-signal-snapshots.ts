#!/usr/bin/env npx tsx
/**
 * Backfill historical signal data snapshots.
 *
 * Fetches historical data from source APIs and writes backdated snapshots
 * to signal_data_snapshots so charts have trend context from day one.
 *
 * Usage:
 *   npx tsx scripts/backfill-signal-snapshots.ts --signal-id <uuid> --years 2
 *   npx tsx scripts/backfill-signal-snapshots.ts --all-data-driven --years 2
 *   npx tsx scripts/backfill-signal-snapshots.ts --all-data-driven --years 2 --dry-run
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, inArray } from 'drizzle-orm';

const { signals, signalDataSnapshots, signalEntityLinks } = schema;

interface BackfillResult {
  signalId: string;
  dataSource: string;
  pointsWritten: number;
  dateRange: string;
}

async function backfillFred(
  signalId: string,
  details: Record<string, unknown>,
  years: number,
  dryRun: boolean
): Promise<BackfillResult> {
  const seriesId = details.seriesId as string;
  const metric = (details.metric as string) || 'level';
  const threshold = details.threshold as number;
  const direction = (details.thresholdDirection as string) || 'above';
  const label = (details.label as string) || seriesId;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error('FRED_API_KEY not set');

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - (years + 1) * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}&sort_order=asc`;
  const res = await fetch(url, { headers: { 'User-Agent': 'TradeJournal-Backfill/1.0' } });
  if (!res.ok) throw new Error(`FRED API failed: ${res.status}`);

  const json = await res.json();
  const observations = json.observations
    .filter((o: { value: string }) => o.value !== '.')
    .map((o: { date: string; value: string }) => ({ date: o.date, value: parseFloat(o.value) }));

  let pointsWritten = 0;
  const startIdx = metric === 'yoy_growth' || metric === 'trailing_12m_sum' ? 12 : 0;

  for (let i = startIdx; i < observations.length; i++) {
    const obs = observations[i];
    let observedValue: number;

    switch (metric) {
      case 'yoy_growth': {
        const yearAgoIdx = observations.findIndex((o: { date: string }) => {
          const diff = Math.abs(new Date(obs.date).getTime() - new Date(o.date).getTime() - 365 * 86400000);
          return diff < 45 * 86400000;
        });
        if (yearAgoIdx < 0 || yearAgoIdx >= i) continue;
        const yearAgo = observations[yearAgoIdx];
        observedValue = ((obs.value - yearAgo.value) / yearAgo.value) * 100;
        break;
      }
      case 'trailing_12m_sum': {
        // Sum previous 12 observations (monthly series)
        if (i < 11) continue;
        observedValue = 0;
        for (let j = i - 11; j <= i; j++) observedValue += observations[j].value;
        break;
      }
      case 'level':
      default:
        observedValue = obs.value;
        break;
    }

    let pct: number;
    if (direction === 'below') {
      if (observedValue > 0 && threshold > 0) pct = (threshold / observedValue) * 100;
      else if (observedValue < 0 && threshold < 0) pct = (Math.abs(threshold) / Math.abs(observedValue)) * 100;
      else pct = 0;
    } else {
      pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
    }

    const snapshotDate = new Date(obs.date + 'T00:00:00Z');
    // Only backfill within the requested year range
    const cutoff = new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000);
    if (snapshotDate < cutoff) continue;

    if (!dryRun) {
      // Use the condition label as data_source suffix to match live collector behavior
      const condLabel = details._conditionLabel as string | undefined;
      const dataSourceKey = condLabel ? `fred:${condLabel}` : 'fred';

      await db.insert(signalDataSnapshots).values({
        signalId,
        snapshotDate,
        observedValue: String(Math.round(observedValue * 1000) / 1000),
        thresholdValue: String(threshold),
        pctToThreshold: String(Math.round(pct * 100) / 100),
        unit: (details.thresholdUnit as string) || '',
        dataSource: dataSourceKey,
        evidenceSummary: `${label}: ${observedValue.toFixed(3)} (backfill)`,
      }).onConflictDoNothing();
    }
    pointsWritten++;
  }

  const dates = observations.filter((_: unknown, idx: number) => idx >= startIdx);
  return {
    signalId,
    dataSource: `fred:${seriesId}`,
    pointsWritten,
    dateRange: `${dates[0]?.date || '?'} to ${dates[dates.length - 1]?.date || '?'}`,
  };
}

async function backfillDefiLlamaStablecoins(
  signalId: string,
  details: Record<string, unknown>,
  years: number,
  dryRun: boolean
): Promise<BackfillResult> {
  const metric = (details.metric as string) || 'total_supply';
  const threshold = details.threshold as number;
  const direction = (details.thresholdDirection as string) || 'below';

  const res = await fetch('https://stablecoins.llama.fi/stablecoincharts/all', {
    headers: { 'User-Agent': 'TradeJournal-Backfill/1.0' },
  });
  if (!res.ok) throw new Error(`DeFiLlama API failed: ${res.status}`);

  const data = await res.json();
  const cutoffTs = (Date.now() / 1000) - (years * 365 * 86400);
  let pointsWritten = 0;

  for (const d of data) {
    const ts = parseInt(d.date);
    if (ts < cutoffTs) continue;

    const circUSD = d.totalCirculatingUSD || d.totalCirculating;
    let observedValue: number;
    if (metric === 'peggedUSD_supply') {
      observedValue = circUSD.peggedUSD || 0;
    } else {
      observedValue = Object.values(circUSD as Record<string, number>).reduce((sum, v) => sum + v, 0);
    }

    let pct = direction === 'below'
      ? (observedValue > 0 ? (threshold / observedValue) * 100 : 0)
      : (threshold > 0 ? (observedValue / threshold) * 100 : 0);

    const snapshotDate = new Date(ts * 1000);

    if (!dryRun) {
      await db.insert(signalDataSnapshots).values({
        signalId,
        snapshotDate,
        observedValue: String(Math.round(observedValue)),
        thresholdValue: String(threshold),
        pctToThreshold: String(Math.round(pct * 100) / 100),
        unit: (details.thresholdUnit as string) || 'USD',
        dataSource: 'defillama_stablecoins',
        evidenceSummary: `Stablecoin supply: $${(observedValue / 1e9).toFixed(1)}B (backfill)`,
      }).onConflictDoNothing();
    }
    pointsWritten++;
  }

  return {
    signalId,
    dataSource: 'defillama_stablecoins',
    pointsWritten,
    dateRange: `${years}y of daily data`,
  };
}

async function backfillWorldBank(
  signalId: string,
  details: Record<string, unknown>,
  years: number,
  dryRun: boolean
): Promise<BackfillResult> {
  const countries = (details.countries as string[]) || ['JPN', 'DEU', 'USA', 'AUS', 'GBR'];
  const operator = (details.operator as string) || 'aggregate_avg';
  const threshold = details.threshold as number;
  const direction = (details.thresholdDirection as string) || 'below';

  const currentYear = new Date().getFullYear();
  const startYear = currentYear - years - 1;
  const countryCodes = countries.join(';').toLowerCase();

  const url = `https://api.worldbank.org/v2/country/${countryCodes}/indicator/MS.MIL.XPND.GD.ZS?format=json&date=${startYear}:${currentYear}&per_page=500`;
  const res = await fetch(url, { headers: { 'User-Agent': 'TradeJournal-Backfill/1.0' } });
  if (!res.ok) throw new Error(`World Bank API failed: ${res.status}`);

  const json = await res.json();
  if (!json[1]) throw new Error('No World Bank data');

  // Group by year
  const byYear = new Map<string, Map<string, number>>();
  for (const r of json[1]) {
    if (r.value === null) continue;
    if (!byYear.has(r.date)) byYear.set(r.date, new Map());
    byYear.get(r.date)!.set(r.countryiso3code, r.value);
  }

  let pointsWritten = 0;
  for (const [year, countryValues] of Array.from(byYear.entries()).sort()) {
    if (parseInt(year) < currentYear - years) continue;

    let observedValue: number;
    const values = Array.from(countryValues.values());
    switch (operator) {
      case 'country_min': observedValue = Math.min(...values); break;
      case 'aggregate_avg':
      default: observedValue = values.reduce((s, v) => s + v, 0) / values.length; break;
    }

    let pct: number;
    if (direction === 'below') {
      pct = observedValue > 0 ? (threshold / observedValue) * 100 : 0;
    } else {
      pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
    }

    // Use July 1 as snapshot date for annual data (mid-year)
    const snapshotDate = new Date(`${year}-07-01T00:00:00Z`);

    const countryStr = Array.from(countryValues.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([iso, v]) => `${iso}: ${v.toFixed(2)}%`)
      .join(', ');

    if (!dryRun) {
      await db.insert(signalDataSnapshots).values({
        signalId,
        snapshotDate,
        observedValue: String(Math.round(observedValue * 1000) / 1000),
        thresholdValue: String(threshold),
        pctToThreshold: String(Math.round(pct * 100) / 100),
        unit: (details.thresholdUnit as string) || '% GDP',
        dataSource: 'worldbank',
        evidenceSummary: `Defense/GDP avg: ${observedValue.toFixed(2)}% (${countryStr}) [${year}]`,
      }).onConflictDoNothing();
    }
    pointsWritten++;
  }

  return {
    signalId,
    dataSource: 'worldbank',
    pointsWritten,
    dateRange: `${currentYear - years} to ${currentYear}`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const allDataDriven = args.includes('--all-data-driven');
  const yearsIdx = args.indexOf('--years');
  const years = yearsIdx >= 0 && args[yearsIdx + 1] ? parseInt(args[yearsIdx + 1]) : 2;
  const sigIdx = args.indexOf('--signal-id');
  const specificId = sigIdx >= 0 && args[sigIdx + 1] ? args[sigIdx + 1] : undefined;

  console.log(`Signal Snapshot Backfill — ${years} years${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Find signals to backfill
  let signalRows;
  if (specificId) {
    signalRows = await db.select({
      id: signals.id,
      statement: signals.statement,
      explicitDetails: signals.explicitDetails,
    }).from(signals).where(eq(signals.id, specificId));
  } else if (allDataDriven) {
    signalRows = await db.selectDistinctOn([signals.id], {
      id: signals.id,
      statement: signals.statement,
      explicitDetails: signals.explicitDetails,
    }).from(signals)
      .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
      .where(and(
        eq(signals.status, 'active'),
        eq(signals.category, 'data_driven'),
        eq(signalEntityLinks.entityType, 'thesis'),
      ));
  } else {
    console.error('Specify --signal-id <uuid> or --all-data-driven');
    process.exit(1);
  }

  console.log(`Found ${signalRows.length} data-driven signal(s) to backfill\n`);

  for (const signal of signalRows) {
    const details = signal.explicitDetails as Record<string, unknown> | null;
    if (!details?.dataSource) {
      console.log(`⚠ ${signal.statement?.slice(0, 60)}: no dataSource, skipping`);
      continue;
    }

    const shortStmt = signal.statement?.slice(0, 60) || signal.id;
    console.log(`[${details.dataSource}] ${shortStmt}...`);

    try {
      let result: BackfillResult;

      switch (details.dataSource as string) {
        case 'fred':
          result = await backfillFred(signal.id, details, years, dryRun);
          // Also backfill conditions
          if (details.conditions) {
            for (const cond of details.conditions as Array<Record<string, unknown>>) {
              if (cond.dataSource === 'fred') {
                const condLabel = ((cond.label as string) || (cond.seriesId as string)).replace(/\s+/g, '_').toLowerCase().slice(0, 40);
                console.log(`  [fred:${condLabel}] backfilling condition...`);
                const condResult = await backfillFred(signal.id, { ...details, ...cond, _conditionLabel: condLabel }, years, dryRun);
                console.log(`  ✓ ${condResult.pointsWritten} points (${condResult.dateRange})`);
              }
            }
          }
          break;
        case 'defillama_stablecoins':
          result = await backfillDefiLlamaStablecoins(signal.id, details, years, dryRun);
          break;
        case 'worldbank':
          result = await backfillWorldBank(signal.id, details, years, dryRun);
          break;
        default:
          console.log(`  ⚠ No backfill handler for ${details.dataSource}`);
          continue;
      }

      console.log(`  ✓ ${result.pointsWritten} points written (${result.dateRange})`);
    } catch (err) {
      console.log(`  ✗ Error: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\nDone.');
  await closeDb();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
