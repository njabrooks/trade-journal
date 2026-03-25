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
import { fetchCoferHistorical } from './lib/collectors/imf-cofer.js';
import { fetchTSMCHistorical } from './lib/collectors/tsmc-revenue.js';
import { fetchEdgarCapexHistorical } from './lib/collectors/sec-edgar-capex.js';

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

async function backfillTSMCRevenue(
  signalId: string,
  details: Record<string, unknown>,
  years: number,
  dryRun: boolean
): Promise<BackfillResult> {
  const threshold = details.threshold as number;
  const direction = (details.thresholdDirection as string) || 'below';
  const label = (details.label as string) || 'TSMC Monthly Revenue';

  const currentYear = new Date().getFullYear();
  const startYear = currentYear - years;
  const data = await fetchTSMCHistorical(startYear, currentYear);

  if (data.length === 0) throw new Error('No TSMC data returned');

  let pointsWritten = 0;
  const monthToNum: Record<string, number> = {
    'Jan.': 1, 'Feb.': 2, 'Mar.': 3, 'Apr.': 4, 'May': 5, 'Jun.': 6,
    'Jul.': 7, 'Aug.': 8, 'Sept.': 9, 'Oct.': 10, 'Nov.': 11, 'Dec.': 12
  };

  for (const d of data) {
    const monthNum = monthToNum[d.month] || 1;
    // TSMC reports revenue by ~10th of following month; use 10th as snapshot date
    const snapshotDate = new Date(Date.UTC(d.year, monthNum, 10));

    let pct: number;
    if (direction === 'below') {
      if (threshold === 0) {
        pct = d.yoyChange <= 0 ? 100 + Math.abs(d.yoyChange) : Math.max(0, 100 - (d.yoyChange / 0.3));
      } else if (d.yoyChange > 0 && threshold > 0) {
        pct = (threshold / d.yoyChange) * 100;
      } else {
        pct = d.yoyChange <= threshold ? 100 : 0;
      }
    } else {
      pct = threshold > 0 ? (d.yoyChange / threshold) * 100 : 0;
    }

    if (!dryRun) {
      await db.insert(signalDataSnapshots).values({
        signalId,
        snapshotDate,
        observedValue: String(Math.round(d.yoyChange * 100) / 100),
        thresholdValue: String(threshold),
        pctToThreshold: String(Math.round(pct * 100) / 100),
        unit: '% YoY',
        dataSource: 'tsmc_revenue',
        evidenceSummary: `${label}: NT$${(d.revenue / 1000).toFixed(0)}B ${d.month} ${d.year} (${d.yoyChange >= 0 ? '+' : ''}${d.yoyChange.toFixed(1)}% YoY) [backfill]`,
      }).onConflictDoNothing();
    }
    pointsWritten++;
  }

  return {
    signalId,
    dataSource: 'tsmc_revenue',
    pointsWritten,
    dateRange: `${startYear} to ${currentYear}`,
  };
}

async function backfillIMFCofer(
  signalId: string,
  details: Record<string, unknown>,
  years: number,
  dryRun: boolean
): Promise<BackfillResult> {
  const threshold = details.threshold as number;
  const direction = (details.thresholdDirection as string) || 'above';
  const label = (details.label as string) || 'USD Share of Global Reserves';

  const startYear = new Date().getFullYear() - years;
  const observations = await fetchCoferHistorical(startYear);

  if (observations.length === 0) throw new Error('No COFER data returned');

  let pointsWritten = 0;
  const cutoff = new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000);

  for (const obs of observations) {
    // Convert quarter period to date (end of quarter)
    const [year, q] = obs.period.split('-Q');
    const quarterEndMonth = parseInt(q) * 3;
    const snapshotDate = new Date(Date.UTC(parseInt(year), quarterEndMonth - 1, 28));

    if (snapshotDate < cutoff) continue;

    let pct: number;
    if (direction === 'below') {
      pct = obs.value > 0 ? (threshold / obs.value) * 100 : 0;
    } else {
      pct = threshold > 0 ? (obs.value / threshold) * 100 : 0;
    }

    if (!dryRun) {
      await db.insert(signalDataSnapshots).values({
        signalId,
        snapshotDate,
        observedValue: String(Math.round(obs.value * 1000) / 1000),
        thresholdValue: String(threshold),
        pctToThreshold: String(Math.round(pct * 100) / 100),
        unit: (details.thresholdUnit as string) || '% of reserves',
        dataSource: 'imf_cofer',
        evidenceSummary: `${label}: ${obs.value.toFixed(2)}% (${obs.period}) [backfill]`,
      }).onConflictDoNothing();
    }
    pointsWritten++;
  }

  return {
    signalId,
    dataSource: 'imf_cofer',
    pointsWritten,
    dateRange: `${observations[0]?.period || '?'} to ${observations[observations.length - 1]?.period || '?'}`,
  };
}

async function backfillSecEdgarCapex(
  signalId: string,
  details: Record<string, unknown>,
  years: number,
  dryRun: boolean
): Promise<BackfillResult> {
  const threshold = details.threshold as number;
  const direction = (details.thresholdDirection as string) || 'below';
  const label = (details.label as string) || 'Big 4 Hyperscaler Capex';

  const aggregates = await fetchEdgarCapexHistorical();

  if (aggregates.length === 0) throw new Error('No EDGAR capex data returned');

  const cutoff = new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000);
  let pointsWritten = 0;

  for (const agg of aggregates) {
    if (agg.yoyGrowthPct === undefined) continue;

    // Use mid-quarter as snapshot date (month 2/5/8/11, day 15)
    const midMonth = (agg.quarter.quarter - 1) * 3 + 2; // Q1→2, Q2→5, Q3→8, Q4→11
    const snapshotDate = new Date(Date.UTC(agg.quarter.year, midMonth - 1, 15));

    if (snapshotDate < cutoff) continue;

    const observedValue = Math.round(agg.yoyGrowthPct * 10) / 10;

    let pct: number;
    if (direction === 'below') {
      if (threshold === 0) {
        pct = observedValue <= 0 ? 100 + Math.abs(observedValue) : Math.max(0, 100 - (observedValue / 0.6));
      } else if (observedValue > 0 && threshold > 0) {
        pct = (threshold / observedValue) * 100;
      } else {
        pct = observedValue <= threshold ? 100 : 0;
      }
    } else {
      pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
    }

    const breakdown = agg.companies
      .sort((a, b) => b.capexBn - a.capexBn)
      .map(c => `${c.company}: $${c.capexBn.toFixed(1)}B`)
      .join(', ');

    if (!dryRun) {
      await db.insert(signalDataSnapshots).values({
        signalId,
        snapshotDate,
        observedValue: String(observedValue),
        thresholdValue: String(threshold),
        pctToThreshold: String(Math.round(pct * 100) / 100),
        unit: '% YoY',
        dataSource: 'sec_edgar_capex',
        evidenceSummary: `${label}: $${agg.totalBn.toFixed(0)}B ${agg.quarter.key} (${observedValue >= 0 ? '+' : ''}${observedValue.toFixed(1)}% YoY) — ${breakdown} [backfill]`,
      }).onConflictDoNothing();
    }
    pointsWritten++;
  }

  const withYoY = aggregates.filter(a => a.yoyGrowthPct !== undefined);
  return {
    signalId,
    dataSource: 'sec_edgar_capex',
    pointsWritten,
    dateRange: `${withYoY[0]?.quarter.key || '?'} to ${withYoY[withYoY.length - 1]?.quarter.key || '?'}`,
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
        case 'fred': {
          // Backfill top-level series if it has a seriesId
          if (details.seriesId) {
            result = await backfillFred(signal.id, details, years, dryRun);
          } else {
            result = { signalId: signal.id, dataSource: 'fred', pointsWritten: 0, dateRange: 'conditions only' };
          }
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
        }
        case 'defillama_stablecoins':
          result = await backfillDefiLlamaStablecoins(signal.id, details, years, dryRun);
          break;
        case 'worldbank':
          result = await backfillWorldBank(signal.id, details, years, dryRun);
          break;
        case 'imf_cofer':
          result = await backfillIMFCofer(signal.id, details, years, dryRun);
          break;
        case 'tsmc_revenue':
          result = await backfillTSMCRevenue(signal.id, details, years, dryRun);
          break;
        case 'sec_edgar_capex':
          result = await backfillSecEdgarCapex(signal.id, details, years, dryRun);
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
