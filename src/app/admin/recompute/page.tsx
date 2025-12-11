'use client';

import { useState, useEffect } from 'react';
import { Account } from '@/db/schema';
import { DashboardShell } from '@/components/layout/DashboardShell';

interface RecomputeResult {
  success: boolean;
  message?: string;
  results?: {
    autoStrategies?:
      | {
          strategiesCreated: number;
          positionsLinked: number;
          tradesLinked?: number;
          skipped: number;
        }
      | { error: string };
    portfolio?: { account: number; underlying: number } | { error: string };
    strategyMetrics?: { count: number } | { error: string };
    triage?: { position: number; strategy: number; quantityChange?: number } | { error: string };
    blotter?: { count: number } | { error: string };
    datesProcessed?: number;
  };
  dateRange?: { startDate: string; endDate: string };
  snapshotDate?: string;
}

export default function RecomputePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [result, setResult] = useState<RecomputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [computeMode, setComputeMode] = useState<'single' | 'range'>('single');
  const [snapshotDate, setSnapshotDate] = useState<string>(
    new Date().toISOString().split('T')[0]!
  );
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]!);
  const [includeUnderlyings, setIncludeUnderlyings] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/accounts');
      if (!response.ok) throw new Error('Failed to load accounts');
      const data = await response.json();
      setAccounts(data);
      if (data.length > 0) {
        setSelectedAccountId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleRecompute = async () => {
    if (!selectedAccountId) {
      setError('Please select an account');
      return;
    }

    setRecomputing(true);
    setError(null);
    setResult(null);

    try {
      const body: any = {
        accountId: selectedAccountId,
      };

      if (computeMode === 'single') {
        if (!snapshotDate) {
          setError('Please select a snapshot date');
          setRecomputing(false);
          return;
        }
        body.snapshotDate = snapshotDate;
      } else {
        if (!startDate || !endDate) {
          setError('Please select start and end dates');
          setRecomputing(false);
          return;
        }
        body.startDate = startDate;
        body.endDate = endDate;
        if (includeUnderlyings) {
          body.includeUnderlyings = true;
        }
      }

      const response = await fetch('/api/recompute/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Recompute failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recompute failed');
    } finally {
      setRecomputing(false);
    }
  };

  if (loading) {
    return (
      <DashboardShell activeNav="admin-recompute" title="Recompute Derived Data" subtitle="Loading...">
        <p>Loading...</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      activeNav="admin-recompute"
      title="Recompute Derived Data"
      subtitle="Trigger recomputation of portfolio snapshots, strategy metrics, and triage records"
    >

      <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6 text-blue-800 text-sm">
        <p className="font-semibold mb-2">What gets recomputed:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Portfolio Snapshots:</strong> Account-level and underlying-level aggregates
            (notional, PnL, %NAV)
          </li>
          <li>
            <strong>Strategy Metrics:</strong> Per-strategy aggregates (exposure, PnL, DTE, etc.)
          </li>
          <li>
            <strong>Triage Records:</strong> Position and strategy-level flags (DTE, ITM, sigma,
            assignment risk, size warnings, quantity changes)
          </li>
          <li>
            <strong>Trade Blotter Entries:</strong> Aggregated trade records from trade ingestion
          </li>
        </ul>
        <p className="mt-2">
          <strong>Note:</strong> Make sure you've uploaded all raw data files (trades, positions,
          NAV, MTM) for the date(s) before recomputing.
        </p>
        <p className="mt-2 text-xs">
          <strong>What's recomputed:</strong> Auto-strategy linking, Portfolio snapshots, Strategy metrics, Triage records (including QUANTITY_CHANGE), and Trade blotter entries.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-6 text-red-800">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Recompute Configuration</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="account" className="block text-sm font-medium mb-2">
              Account *
            </label>
            <select
              id="account"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full border rounded px-3 py-2"
              disabled={recomputing}
            >
              <option value="">Select account...</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.brokerAccountId} {acc.label ? `(${acc.label})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Compute Mode *</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="single"
                  checked={computeMode === 'single'}
                  onChange={(e) => setComputeMode(e.target.value as 'single' | 'range')}
                  className="mr-2"
                  disabled={recomputing}
                />
                Single Date
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="range"
                  checked={computeMode === 'range'}
                  onChange={(e) => setComputeMode(e.target.value as 'single' | 'range')}
                  className="mr-2"
                  disabled={recomputing}
                />
                Date Range
              </label>
            </div>
          </div>

          {computeMode === 'single' ? (
            <div>
              <label htmlFor="snapshotDate" className="block text-sm font-medium mb-2">
                Snapshot Date *
              </label>
              <input
                type="date"
                id="snapshotDate"
                value={snapshotDate}
                onChange={(e) => setSnapshotDate(e.target.value)}
                className="w-full border rounded px-3 py-2"
                disabled={recomputing}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    id="startDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={recomputing}
                  />
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium mb-2">
                    End Date *
                  </label>
                  <input
                    type="date"
                    id="endDate"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={recomputing}
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={includeUnderlyings}
                    onChange={(e) => setIncludeUnderlyings(e.target.checked)}
                    className="mr-2"
                    disabled={recomputing}
                  />
                  Include underlying-level portfolio snapshots (only for latest date in range)
                </label>
              </div>
            </>
          )}

          <button
            onClick={handleRecompute}
            disabled={recomputing || !selectedAccountId}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
          >
            {recomputing ? 'Recomputing...' : 'Recompute All Derived Data'}
          </button>
        </div>
      </div>

      {result && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-green-800">
            {result.success ? 'Recompute Successful' : 'Recompute Failed'}
          </h2>

          {result.message && (
            <p className="mb-4 text-gray-700">{result.message}</p>
          )}

          {result.results && (
            <div className="space-y-4">
              {result.results.autoStrategies && (
                <div>
                  <h3 className="font-semibold mb-2">Auto Strategy Linking</h3>
                  {'error' in result.results.autoStrategies ? (
                    <p className="text-red-600 text-sm">
                      {result.results.autoStrategies.error}
                    </p>
                  ) : (
                    <div className="text-sm text-gray-600">
                      <p>Strategies created: {result.results.autoStrategies.strategiesCreated}</p>
                      <p>Positions linked: {result.results.autoStrategies.positionsLinked}</p>
                      {typeof result.results.autoStrategies.tradesLinked === 'number' && (
                        <p>Trades linked: {result.results.autoStrategies.tradesLinked}</p>
                      )}
                      <p>Skipped: {result.results.autoStrategies.skipped}</p>
                    </div>
                  )}
                </div>
              )}
              <div>
                <h3 className="font-semibold mb-2">Portfolio Snapshots</h3>
                {result.results.portfolio && 'error' in result.results.portfolio ? (
                  <p className="text-red-600 text-sm">{result.results.portfolio.error}</p>
                ) : (
                  <div className="text-sm text-gray-600">
                    <p>
                      Account-level: {result.results.portfolio?.account ?? 0} snapshots
                    </p>
                    {result.results.portfolio && 'underlying' in result.results.portfolio && (
                      <p>
                        Underlying-level: {result.results.portfolio.underlying} snapshots
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-2">Strategy Metrics</h3>
                {result.results.strategyMetrics && 'error' in result.results.strategyMetrics ? (
                  <p className="text-red-600 text-sm">
                    {result.results.strategyMetrics.error}
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">
                    {result.results.strategyMetrics?.count ?? 0} strategy-date combinations
                  </p>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-2">Triage Records</h3>
                {result.results.triage && 'error' in result.results.triage ? (
                  <p className="text-red-600 text-sm">{result.results.triage.error}</p>
                ) : (
                  <div className="text-sm text-gray-600">
                    <p>Position-level: {result.results.triage?.position ?? 0} records</p>
                    <p>Strategy-level: {result.results.triage?.strategy ?? 0} records</p>
                    {typeof result.results.triage?.quantityChange === 'number' && (
                      <p>Quantity change: {result.results.triage.quantityChange} records</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-2">Trade Blotter Entries</h3>
                {result.results.blotter && 'error' in result.results.blotter ? (
                  <p className="text-red-600 text-sm">{result.results.blotter.error}</p>
                ) : (
                  <p className="text-sm text-gray-600">
                    {result.results.blotter?.count ?? 0} trade blotter entries
                  </p>
                )}
              </div>

              {result.results.datesProcessed && (
                <div>
                  <p className="text-sm text-gray-600">
                    Total dates processed: {result.results.datesProcessed}
                  </p>
                </div>
              )}

              {result.snapshotDate && (
                <div>
                  <p className="text-sm text-gray-500">
                    Snapshot date: {result.snapshotDate}
                  </p>
                </div>
              )}

              {result.dateRange && (
                <div>
                  <p className="text-sm text-gray-500">
                    Date range: {result.dateRange.startDate} to {result.dateRange.endDate}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
        <p className="font-semibold mb-2">Tips:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            For single date: Use when you've just uploaded all files for a specific date
          </li>
          <li>
            For date range: Use when backfilling historical data or processing multiple days
          </li>
          <li>
            Recomputing is idempotent - safe to run multiple times for the same date/range
          </li>
          <li>
            Large date ranges may take a while - be patient and don't refresh the page
          </li>
        </ul>
      </div>
    </DashboardShell>
  );
}

