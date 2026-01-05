/**
 * Common types for monitoring service
 * Used across all data source clients
 */

/**
 * Normalized data source result format
 * All clients transform their responses to this format
 */
export interface DataSourceResult {
  title: string;
  date: string; // ISO timestamp
  source: string;
  snippet: string;
  link?: string;
  rawData?: any; // Source-specific metadata
}

/**
 * Monitoring check results grouped by data source
 */
export interface MonitoringCheckResults {
  eventId?: string; // Set after saving to database
  checkedAt: Date;
  results: {
    [dataSource: string]: {
      count: number;
      items: DataSourceResult[];
      error?: string;
    };
  };
  totalResults: number;
  errors: string[];
}

/**
 * Options for running a monitoring check
 */
export interface MonitoringCheckOptions {
  dataSources?: DataSource[]; // Defaults to spec's sources
  dateRange?: {
    start: string; // YYYY-MM-DD
    end: string; // YYYY-MM-DD
  };
  keywords?: string[]; // Override spec's keywords
}

/**
 * Supported data sources
 */
export type DataSource = 'fred' | 'news' | 'price_iv' | 'sec_filings';

/**
 * Data source client interface
 * All clients implement this interface
 */
export interface DataSourceClient {
  query(params: any): Promise<DataSourceResult[]>;
}

/**
 * Error details for failed data source queries
 */
export interface DataSourceError {
  source: DataSource;
  error: string;
  timestamp: Date;
}
