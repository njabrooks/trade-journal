/**
 * Monitoring Service Orchestrator
 *
 * Coordinates multiple data source clients to execute monitoring checks.
 * Central entry point for running checks across FRED, News, Price/IV, and SEC filings.
 */

import type { MonitoringSpec } from '@/db/schema';
import { queryFred } from './fredClient';
import { queryNews } from './newsClient';
import { queryPriceIv } from './priceIvClient';
import { querySecFilings } from './secFilingsClient';
import type {
  MonitoringCheckResults,
  MonitoringCheckOptions,
  DataSource,
  DataSourceResult,
  DataSourceError,
} from './types';

/**
 * Run monitoring check for a specification
 * Orchestrates queries across all configured data sources
 */
export async function runMonitoringCheck(
  spec: MonitoringSpec,
  options?: MonitoringCheckOptions
): Promise<MonitoringCheckResults> {
  const checkedAt = new Date();
  const results: MonitoringCheckResults['results'] = {};
  const errors: string[] = [];

  // Determine which data sources to query
  const dataSources = options?.dataSources || (spec.sources as DataSource[]);
  const keywords = options?.keywords || (spec.keywords as string[]);

  // Calculate date range
  const dateRange = options?.dateRange || calculateDefaultDateRange(spec.frequency as string);

  // Query each data source in parallel
  const queries = dataSources.map(async (source) => {
    try {
      let items: DataSourceResult[] = [];

      switch (source) {
        case 'fred':
          items = await queryFred({
            series: keywords, // For FRED, keywords are series IDs
            startDate: dateRange.start,
            endDate: dateRange.end,
          });
          break;

        case 'news':
          const newsTicker = extractTickerFromSpec(spec);
          items = await queryNews({
            keywords,
            tickers: newsTicker ? [newsTicker] : undefined,
            startDate: dateRange.start,
            endDate: dateRange.end,
          });
          break;

        case 'price_iv':
          // Extract ticker from semantic description or keywords
          const ticker = extractTickerFromSpec(spec);
          if (ticker) {
            items = await queryPriceIv({
              ticker,
              startDate: dateRange.start,
              endDate: dateRange.end,
              metrics: ['spot', 'iv30', 'iv_rank'],
            });
          } else {
            errors.push('price_iv: No ticker found in spec');
          }
          break;

        case 'sec_filings':
          const secTicker = extractTickerFromSpec(spec);
          if (secTicker) {
            items = await querySecFilings({
              ticker: secTicker,
              filingTypes: ['8-K', '10-Q', '10-K'],
              startDate: dateRange.start,
              endDate: dateRange.end,
              keywords,
            });
          } else {
            errors.push('sec_filings: No ticker found in spec');
          }
          break;

        default:
          errors.push(`Unknown data source: ${source}`);
      }

      results[source] = {
        count: items.length,
        items,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : `Unknown error querying ${source}`;
      errors.push(`${source}: ${errorMsg}`);
      results[source] = {
        count: 0,
        items: [],
        error: errorMsg,
      };
    }
  });

  await Promise.all(queries);

  // Calculate total results
  const totalResults = Object.values(results).reduce((sum, r) => sum + r.count, 0);

  return {
    checkedAt,
    results,
    totalResults,
    errors,
  };
}

/**
 * Calculate default date range based on check frequency
 */
function calculateDefaultDateRange(frequency: string): { start: string; end: string } {
  const end = new Date();
  const start = new Date();

  switch (frequency) {
    case 'daily':
      start.setDate(start.getDate() - 7); // Look back 7 days for daily checks
      break;
    case 'weekly':
      start.setDate(start.getDate() - 30); // Look back 30 days for weekly checks
      break;
    case 'on_demand':
      start.setDate(start.getDate() - 90); // Look back 90 days for on-demand
      break;
    default:
      start.setDate(start.getDate() - 30);
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

/**
 * Extract ticker symbol from monitoring spec
 * Looks for ticker patterns in keywords or semantic description
 */
function extractTickerFromSpec(spec: MonitoringSpec): string | null {
  const keywords = spec.keywords as string[];
  const description = spec.semanticDescription || '';

  // Check keywords first
  for (const keyword of keywords) {
    // Match ticker patterns: 1-5 uppercase letters
    if (/^[A-Z]{1,5}$/.test(keyword)) {
      return keyword;
    }
  }

  // Check semantic description for ticker mentions
  const tickerMatch = description.match(/\b([A-Z]{1,5})\b/);
  if (tickerMatch) {
    return tickerMatch[1];
  }

  return null;
}

/**
 * Validate monitoring spec configuration
 */
export function validateMonitoringSpec(spec: Partial<MonitoringSpec>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!spec.validationPointId) {
    errors.push('validationPointId is required');
  }

  if (!spec.keywords || (spec.keywords as string[]).length === 0) {
    errors.push('At least one keyword is required');
  }

  if (!spec.sources || (spec.sources as string[]).length === 0) {
    errors.push('At least one data source is required');
  }

  if (!spec.frequency || !['daily', 'weekly', 'on_demand'].includes(spec.frequency as string)) {
    errors.push('frequency must be daily, weekly, or on_demand');
  }

  if (!spec.alertThreshold) {
    errors.push('alertThreshold is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Export all data source clients
 */
export * from './fredClient';
export * from './newsClient';
export * from './priceIvClient';
export * from './secFilingsClient';
export * from './types';
