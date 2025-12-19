'use client';

/**
 * IBKR Data Sync Banner
 * 
 * Shows banner when data needs to be synced
 * Triggers sync on user action
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface SyncStatus {
  authenticated: boolean;
  requiresAuth?: boolean;
  summary?: {
    totalTickers: number;
    tickersWithMissingData: number;
    totalMissingDays: number;
    oldestMissingDate: string | null;
    newestMissingDate: string | null;
    sourceCoverage?: Array<{
      source: string;
      tickers: number;
      dates: number;
    }>;
    ibkrCoverage?: {
      tickers: number;
      dates: number;
      coveragePercent: number;
    };
  };
  message?: string;
}

export function DataSyncBanner() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    fetched: number;
    inserted: number;
    updated: number;
  } | null>(null);

  // Check sync status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    setLoading(true);
    try {
      const response = await fetch('/api/ibkr/sync-data');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Error checking sync status:', error);
      setStatus({
        authenticated: false,
        requiresAuth: true,
        message: 'Failed to check sync status',
      });
    } finally {
      setLoading(false);
    }
  }

  async function syncData() {
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const response = await fetch('/api/ibkr/sync-data', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSyncResult(data);
        // Refresh status after sync
        await checkStatus();
      } else {
        setSyncResult({
          success: false,
          message: data.error || 'Sync failed',
          fetched: 0,
          inserted: 0,
          updated: 0,
        });
      }
    } catch (error) {
      setSyncResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        fetched: 0,
        inserted: 0,
        updated: 0,
      });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <Alert className="mb-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>Checking data sync status...</AlertTitle>
      </Alert>
    );
  }

  if (!status) {
    return null;
  }

  // Not authenticated - show auth required message
  if (!status.authenticated || status.requiresAuth) {
    return (
      <Alert className="mb-4 border-yellow-200 bg-yellow-50">
        <AlertCircle className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-800">IBKR Gateway Authentication Required</AlertTitle>
        <AlertDescription className="text-yellow-700 mt-2">
          <p className="mb-2">{status.message}</p>
          <p className="text-sm">
            Please log in at{' '}
            <a
              href="https://localhost:5001"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              https://localhost:5001
            </a>
            {' '}and then click "Check Status" below.
          </p>
          <Button
            onClick={checkStatus}
            variant="outline"
            size="sm"
            className="mt-3"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Check Status
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // All IBKR data up to date
  if (status.summary && status.summary.totalMissingDays === 0) {
    const sourceCoverage = status.summary.sourceCoverage || [];
    const ibkrCoverage = status.summary.ibkrCoverage;
    return (
      <Alert className="mb-4 border-green-200 bg-green-50">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-800">IBKR Data Up to Date</AlertTitle>
        <AlertDescription className="text-green-700">
          <p>All IBKR spot price data is current. (IV data comes from Massive.)</p>
          {ibkrCoverage && (
            <p className="text-sm mt-1">
              IBKR coverage: {ibkrCoverage.tickers} tickers, {ibkrCoverage.dates} dates ({ibkrCoverage.coveragePercent}% of all dates)
            </p>
          )}
          {sourceCoverage.length > 0 && (
            <div className="text-xs mt-2 space-y-1">
              <p className="font-medium">All active sources:</p>
              {sourceCoverage
                .filter(src => src.dates > 0)
                .map((src) => (
                  <p key={src.source} className="ml-2">
                    • {src.source}: {src.tickers} tickers, {src.dates} dates
                  </p>
                ))}
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // Missing IBKR data - show sync option
  const missingDays = status.summary?.totalMissingDays || 0;
  const missingTickers = status.summary?.tickersWithMissingData || 0;
  const sourceCoverage = status.summary?.sourceCoverage || [];
  const ibkrCoverage = status.summary?.ibkrCoverage;

  return (
    <div className="space-y-2 mb-4">
      <Alert className="border-blue-200 bg-blue-50">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-800">IBKR Data Sync Available</AlertTitle>
        <AlertDescription className="text-blue-700 mt-2">
          <p className="mb-2">
            Missing {missingDays} day{missingDays !== 1 ? 's' : ''} of IBKR data for {missingTickers} ticker{missingTickers !== 1 ? 's' : ''}.
            {ibkrCoverage && (
              <span className="text-xs ml-2">
                (Current IBKR coverage: {ibkrCoverage.coveragePercent}%)
              </span>
            )}
          </p>
          {status.summary?.oldestMissingDate && (
            <p className="text-sm mb-2">
              Missing IBKR dates: {status.summary.oldestMissingDate}
              {status.summary.newestMissingDate !== status.summary.oldestMissingDate &&
                ` to ${status.summary.newestMissingDate}`}
            </p>
          )}
          <p className="text-xs mb-2 text-blue-600">
            Note: IBKR spot prices are prioritized over other sources. IV data comes from Massive.
          </p>
          {sourceCoverage.length > 0 && (
            <div className="text-xs mb-3 space-y-1">
              <p className="font-medium">All data sources:</p>
              {sourceCoverage.map((src) => (
                <p key={src.source} className="ml-2">
                  • <strong>{src.source}</strong>: {src.tickers} tickers, {src.dates} dates
                  {src.source === 'ibkr' && ' (primary)'}
                </p>
              ))}
            </div>
          )}
          <Button
            onClick={syncData}
            disabled={syncing}
            size="sm"
            className="mt-2"
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing IBKR Data...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Missing IBKR Data
              </>
            )}
          </Button>
        </AlertDescription>
      </Alert>

      {syncResult && (
        <Alert
          className={
            syncResult.success
              ? 'border-green-200 bg-green-50'
              : 'border-red-200 bg-red-50'
          }
        >
          {syncResult.success ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600" />
          )}
          <AlertTitle
            className={syncResult.success ? 'text-green-800' : 'text-red-800'}
          >
            {syncResult.success ? 'Sync Complete' : 'Sync Failed'}
          </AlertTitle>
          <AlertDescription
            className={syncResult.success ? 'text-green-700' : 'text-red-700'}
          >
            <p>{syncResult.message}</p>
            {syncResult.success && (
              <p className="text-sm mt-1">
                Fetched: {syncResult.fetched} | Inserted: {syncResult.inserted} | Updated: {syncResult.updated}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

