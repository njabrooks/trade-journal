'use client';

import { useState, useEffect } from 'react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { IngestionTabs } from '@/components/layout/IngestionTabs';

interface IngestionResult {
  success: boolean;
  message?: string;
  summary?: {
    tickersProcessed: number;
    tickersFound?: number;
    inserted?: number;
    updated?: number;
    skipped?: number;
    processed?: number;
    dateRange?: { start: string; end: string };
    errors?: Array<{ ticker: string; error: string } | { ticker: string; date: string; error: string }>;
  };
  error?: string;
}

export default function UnderlyingsIvIngestionPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [loadingTickers, setLoadingTickers] = useState(false);
  const [onlyRecent, setOnlyRecent] = useState(true);
  const [recentDays, setRecentDays] = useState(90);
  const [customTickers, setCustomTickers] = useState('');
  const [useCustomTickers, setUseCustomTickers] = useState(false);
  const [backfillSpot, setBackfillSpot] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadAvailableTickers();
  }, [onlyRecent, recentDays]);

  const loadAvailableTickers = async () => {
    setLoadingTickers(true);
    try {
      const response = await fetch(
        `/api/admin/backfill-underlyings?onlyRecent=${onlyRecent}&recentDays=${recentDays}`
      );
      const data = await response.json();
      if (data.success) {
        setAvailableTickers(data.tickers || []);
      }
    } catch (error) {
      console.error('Error loading tickers:', error);
    } finally {
      setLoadingTickers(false);
    }
  };

  const handleIngest = async () => {
    setLoading(true);
    setResult(null);

    try {
      let tickers: string[] = [];

      if (useCustomTickers && customTickers.trim()) {
        // Use custom tickers
        tickers = customTickers
          .split(/[,\n]/)
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean);
      } else {
        // Use tickers from database
        tickers = availableTickers;
      }

      if (tickers.length === 0) {
        setResult({
          success: false,
          error: 'No tickers to process',
        });
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/backfill-underlyings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tickers: useCustomTickers ? tickers : undefined,
          onlyRecent: !useCustomTickers ? onlyRecent : undefined,
          recentDays: !useCustomTickers ? recentDays : undefined,
          backfillSpot: backfillSpot || undefined,
          startDate: backfillSpot && startDate ? startDate : undefined,
          endDate: backfillSpot && endDate ? endDate : undefined,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Ingestion failed',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell
      activeNav="admin-ingestion"
      title="Underlyings IV History Ingestion"
      subtitle="Scrape and ingest implied volatility data from Option Strategist"
      tabs={<IngestionTabs />}
    >
      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">IV History Ingestion</h2>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={backfillSpot}
                onChange={(e) => setBackfillSpot(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium">Backfill Spot Prices (Yahoo Finance)</span>
            </label>
          </div>

          {backfillSpot && (
            <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded p-4 text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-semibold mb-2">Spot Price Backfilling:</p>
              <p className="mb-2">
                Fetches historical spot prices from Yahoo Finance for the selected tickers and date range.
                If no date range is provided, automatically finds dates from positions in the database.
              </p>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium mb-1">
                    Start Date (optional)
                  </label>
                  <input
                    type="date"
                    id="startDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium mb-1">
                    End Date (optional)
                  </label>
                  <input
                    type="date"
                    id="endDate"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs">
                Leave dates empty to auto-detect from positions. Only updates records where spot is missing.
              </p>
            </div>
          )}

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useCustomTickers}
                onChange={(e) => setUseCustomTickers(e.target.checked)}
                className="rounded"
                disabled={backfillSpot}
              />
              <span className={`text-sm font-medium ${backfillSpot ? 'text-muted-foreground' : ''}`}>
                Use custom tickers
              </span>
            </label>
          </div>

          {useCustomTickers ? (
            <div>
              <label htmlFor="customTickers" className="block text-sm font-medium mb-2">
                Tickers (comma or newline separated)
              </label>
              <textarea
                id="customTickers"
                value={customTickers}
                onChange={(e) => setCustomTickers(e.target.value)}
                placeholder="AAPL, MSFT, TSLA"
                className="w-full border rounded-md p-2 text-sm font-mono"
                rows={4}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={onlyRecent}
                    onChange={(e) => setOnlyRecent(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">Only recent tickers</span>
                </label>
                {onlyRecent && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm">Last</label>
                    <input
                      type="number"
                      value={recentDays}
                      onChange={(e) => setRecentDays(parseInt(e.target.value) || 90)}
                      min={1}
                      max={365}
                      className="w-20 border rounded px-2 py-1 text-sm"
                    />
                    <label className="text-sm">days</label>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Available Tickers ({loadingTickers ? 'Loading...' : availableTickers.length})
                </label>
                {loadingTickers ? (
                  <div className="text-sm text-muted-foreground">Loading tickers...</div>
                ) : availableTickers.length > 0 ? (
                  <div className="max-h-32 overflow-y-auto border rounded p-2 text-sm font-mono">
                    {availableTickers.join(', ')}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No tickers found</div>
                )}
              </div>
            </div>
          )}

          {!backfillSpot && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-4 text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-2">Data Source:</p>
            <p>
              This tool scrapes Option Strategist&apos;s free volatility data page. Data is
              typically updated weekly. The scraper extracts:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Spot price (underlying close)</li>
              <li>IV30 (30-day implied volatility, converted to decimal)</li>
              <li>Snapshot date (from Option Strategist date code)</li>
            </ul>
            <p className="mt-2 text-xs">
              Note: This is a weekly data source. For daily data, consider integrating with IBKR
              API (see Future Enhancements).
            </p>
          </div>
          )}

          <button
            onClick={handleIngest}
            disabled={
              loading ||
              (backfillSpot && useCustomTickers && !customTickers.trim()) ||
              (backfillSpot && !useCustomTickers && availableTickers.length === 0) ||
              (!backfillSpot && useCustomTickers && !customTickers.trim()) ||
              (!backfillSpot && !useCustomTickers && availableTickers.length === 0)
            }
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            {loading
              ? backfillSpot
                ? 'Backfilling Spot Prices...'
                : 'Ingesting...'
              : backfillSpot
                ? 'Backfill Spot Prices'
                : 'Ingest IV History'}
          </button>
        </div>
      </div>

      {result && (
        <div
          className={`rounded-lg shadow p-6 ${
            result.success ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
          }`}
        >
          <h2
            className={`text-xl font-semibold mb-4 ${
              result.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
            }`}
          >
            {result.success ? 'Ingestion Successful' : 'Ingestion Failed'}
          </h2>

          {result.error && (
            <div className="mb-4 text-red-700 dark:text-red-300">
              <p className="font-semibold">Error:</p>
              <p>{result.error}</p>
              {result.message && <p className="mt-1 text-sm">{result.message}</p>}
            </div>
          )}

          {result.message && result.success && (
            <div className="mb-4 text-green-700 dark:text-green-300">
              <p>{result.message}</p>
            </div>
          )}

          {result.summary && (
            <div className="space-y-2 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold">Tickers Processed:</span>{' '}
                  {result.summary.tickersProcessed}
                </div>
                {result.summary.tickersFound !== undefined && (
                <div>
                  <span className="font-semibold">Tickers Found:</span>{' '}
                  {result.summary.tickersFound}
                </div>
                )}
                {result.summary.inserted !== undefined && (
                <div>
                  <span className="font-semibold">Inserted:</span> {result.summary.inserted}
                </div>
                )}
                {result.summary.updated !== undefined && (
                <div>
                  <span className="font-semibold">Updated:</span> {result.summary.updated}
                </div>
                )}
                {result.summary.processed !== undefined && (
                  <div>
                    <span className="font-semibold">Records Processed:</span>{' '}
                    {result.summary.processed}
                  </div>
                )}
                {result.summary.skipped !== undefined && (
                <div>
                  <span className="font-semibold">Skipped:</span> {result.summary.skipped}
                </div>
                )}
                {result.summary.dateRange && (
                  <>
                    <div>
                      <span className="font-semibold">Date Range Start:</span>{' '}
                      {result.summary.dateRange.start}
                    </div>
                    <div>
                      <span className="font-semibold">Date Range End:</span>{' '}
                      {result.summary.dateRange.end}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {result.summary?.errors && result.summary.errors.length > 0 && (
            <div className="mt-4">
              <p className="font-semibold text-sm mb-2">Errors:</p>
              <div className="max-h-48 overflow-y-auto text-xs">
                {result.summary.errors.map((err, idx) => (
                  <div key={idx} className="mb-1 text-red-700 dark:text-red-300">
                    {err.ticker}: {err.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}

