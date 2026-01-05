import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { DataSourceResult } from './types';

const execAsync = promisify(exec);

/**
 * FRED data source client for monitoring
 * Wraps OpenBB Python script for querying FRED economic indicators
 */

export interface FredQueryParams {
  series: string[]; // e.g., ['UNRATE', 'ICSA', 'DGS10']
  days?: number; // Number of days of history (default: 30)
  startDate?: string; // YYYY-MM-DD (overrides days)
  endDate?: string; // YYYY-MM-DD (defaults to today)
}

export interface FredSeriesValue {
  date: string; // YYYY-MM-DD
  value: number | null;
}

export interface FredSeriesResult {
  series_id: string;
  latest_value?: number | null;
  latest_date?: string | null;
  previous_value?: number | null;
  change?: number | null;
  change_percent?: number | null;
  values_count?: number;
  values: FredSeriesValue[];
  error?: string | null;
}

export interface FredQueryResponse {
  query_date: string;
  start_date: string;
  end_date: string;
  series_count: number;
  series: FredSeriesResult[];
}

/**
 * Query FRED series via OpenBB Python script
 */
export async function queryFred(params: FredQueryParams): Promise<DataSourceResult[]> {
  const { series, days = 30, startDate, endDate } = params;

  if (series.length === 0) {
    throw new Error('At least one FRED series ID is required');
  }

  // Filter to only valid FRED series IDs (uppercase letters/numbers, no spaces)
  const validSeries = series.filter((s) => /^[A-Z0-9]+$/.test(s.trim().toUpperCase()));

  if (validSeries.length === 0) {
    // No valid FRED series found, return empty results
    console.warn('No valid FRED series IDs found in keywords:', series);
    return [];
  }

  // Build command
  const scriptPath = path.join(process.cwd(), 'scripts/openbb/query_fred_monitoring.py');
  const seriesArg = validSeries.map((s) => s.trim().toUpperCase()).join(',');

  let command = `python3 "${scriptPath}" "${seriesArg}"`;

  if (startDate) {
    command += ` --start-date "${startDate}"`;
  } else {
    command += ` --days ${days}`;
  }

  if (endDate) {
    command += ` --end-date "${endDate}"`;
  }

  try {
    // Execute Python script
    const { stdout, stderr } = await execAsync(command, {
      env: {
        ...process.env,
        FRED_API_KEY: process.env.FRED_API_KEY,
      },
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large datasets
    });

    if (stderr) {
      console.error('FRED query stderr:', stderr);
    }

    // Parse JSON response
    const response: FredQueryResponse = JSON.parse(stdout);

    // Transform to DataSourceResult format
    const results: DataSourceResult[] = [];

    for (const seriesResult of response.series) {
      if (seriesResult.error) {
        // Log error but don't fail entire query
        console.error(`FRED series ${seriesResult.series_id} error:`, seriesResult.error);
        continue;
      }

      if (seriesResult.latest_value === null || seriesResult.latest_value === undefined) {
        console.warn(`FRED series ${seriesResult.series_id} has no latest value, skipping`);
        continue;
      }

      // Debug log to see what we're getting
      console.log(`Processing FRED series ${seriesResult.series_id}:`, {
        latestValue: seriesResult.latest_value,
        type: typeof seriesResult.latest_value,
        change: seriesResult.change,
        changePercent: seriesResult.change_percent,
      });

      // Format the result as a monitoring event
      const latestValue = Number(seriesResult.latest_value);
      const change = seriesResult.change !== null && seriesResult.change !== undefined ? Number(seriesResult.change) : null;
      const changePercent = seriesResult.change_percent !== null && seriesResult.change_percent !== undefined ? Number(seriesResult.change_percent) : null;

      const changeText =
        change !== null
          ? `${change > 0 ? '+' : ''}${change.toFixed(2)} (${
              changePercent !== null
                ? `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`
                : 'N/A'
            })`
          : 'N/A';

      // Get human-readable name from metadata
      const metadata = FRED_SERIES_METADATA[seriesResult.series_id];
      const displayName = metadata
        ? `${metadata.name} (${seriesResult.series_id})`
        : seriesResult.series_id;
      const category = metadata?.category || 'Economic Indicator';

      results.push({
        title: `${displayName}: ${latestValue.toFixed(2)}`,
        date: seriesResult.latest_date || '',
        source: 'FRED',
        snippet: `${category} | Current: ${latestValue.toFixed(2)} as of ${
          seriesResult.latest_date
        } | Change: ${changeText}`,
        link: `https://fred.stlouisfed.org/series/${seriesResult.series_id}`,
        rawData: seriesResult,
      });
    }

    return results;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`FRED query failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get metadata for common FRED series
 * Maps series ID to human-readable name
 */
export const FRED_SERIES_METADATA: Record<string, { name: string; category: string }> = {
  // Labor Market
  UNRATE: { name: 'Unemployment Rate', category: 'Labor' },
  PAYEMS: { name: 'Nonfarm Payrolls', category: 'Labor' },
  ICSA: { name: 'Initial Claims', category: 'Labor' },
  JTSJOL: { name: 'Job Openings (JOLTS)', category: 'Labor' },

  // Inflation
  CPIAUCSL: { name: 'CPI (All Items)', category: 'Inflation' },
  CPILFESL: { name: 'Core CPI', category: 'Inflation' },
  PCEPI: { name: 'PCE', category: 'Inflation' },
  PCEPILFE: { name: 'Core PCE', category: 'Inflation' },
  T5YIE: { name: '5Y Breakeven Inflation', category: 'Inflation' },
  T10YIE: { name: '10Y Breakeven Inflation', category: 'Inflation' },

  // Interest Rates
  FEDFUNDS: { name: 'Fed Funds Rate', category: 'Rates' },
  DFF: { name: 'Fed Funds (Daily)', category: 'Rates' },
  DGS2: { name: '2Y Treasury', category: 'Rates' },
  DGS10: { name: '10Y Treasury', category: 'Rates' },
  DGS30: { name: '30Y Treasury', category: 'Rates' },
  T10Y2Y: { name: '10Y-2Y Spread', category: 'Rates' },
  T10Y3M: { name: '10Y-3M Spread', category: 'Rates' },

  // Credit
  BAMLH0A0HYM2: { name: 'HY OAS', category: 'Credit' },
  BAMLC0A4CBBB: { name: 'BBB OAS', category: 'Credit' },

  // Growth
  GDP: { name: 'Real GDP', category: 'Growth' },
  GDPC1: { name: 'Real GDP (Chained)', category: 'Growth' },
  INDPRO: { name: 'Industrial Production', category: 'Growth' },

  // Consumer
  UMCSENT: { name: 'Consumer Sentiment', category: 'Consumer' },
  RSXFS: { name: 'Retail Sales', category: 'Consumer' },

  // Housing
  HOUST: { name: 'Housing Starts', category: 'Housing' },
  MORTGAGE30US: { name: '30Y Mortgage Rate', category: 'Housing' },
};

/**
 * Validate FRED series IDs
 */
export function validateFredSeries(series: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const seriesId of series) {
    const normalized = seriesId.trim().toUpperCase();
    if (normalized.length > 0 && /^[A-Z0-9]+$/.test(normalized)) {
      valid.push(normalized);
    } else {
      invalid.push(seriesId);
    }
  }

  return { valid, invalid };
}
