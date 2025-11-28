'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Strategy, Position, Trade } from '@/db/schema';
import { DashboardShell } from '@/components/layout/DashboardShell';

interface LinkingResult {
  linked: number;
  skipped: number;
}

export default function StrategyLinkingPage() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params.id as string;

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [result, setResult] = useState<LinkingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlinkedPositions, setUnlinkedPositions] = useState<Position[]>([]);
  const [unlinkedTrades, setUnlinkedTrades] = useState<Trade[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (strategyId) {
      loadData();
    }
  }, [strategyId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const strategyRes = await fetch(`/api/strategies?id=${strategyId}`);
      if (!strategyRes.ok) throw new Error('Failed to load strategy');

      const strategyData = await strategyRes.json();
      setStrategy(strategyData);

      // Load unlinked positions and trades for this account
      if (strategyData.accountId) {
        await loadUnlinkedItems(strategyData.accountId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadUnlinkedItems = async (accountId: string) => {
    // In a real implementation, you'd have API endpoints to fetch unlinked positions/trades
    // For now, we'll use the linking API which can show what would be linked
    // This is a simplified version - you might want to add dedicated endpoints
  };

  const handleAutoLink = async (type: 'positions' | 'trades') => {
    if (!strategy) return;

    setLinking(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/strategies/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          accountId: strategy.accountId,
          strategyId: strategy.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Linking failed');
      }

      const data = await response.json();
      setResult({ linked: data.linked, skipped: data.skipped });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Linking failed');
    } finally {
      setLinking(false);
    }
  };

  const handleManualLink = async (type: 'position' | 'trade', id: string) => {
    if (!strategy) return;

    try {
      const response = await fetch('/api/strategies/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          [`${type}Id`]: id,
          strategyId: strategy.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Linking failed');
      }

      await loadData();
      if (type === 'position') {
        setSelectedPositions(new Set());
      } else {
        setSelectedTrades(new Set());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Linking failed');
    }
  };

  if (loading) {
    return (
      <DashboardShell activeNav="admin-strategies" title="Link Data to Strategy" subtitle="Loading...">
        <p>Loading...</p>
      </DashboardShell>
    );
  }

  if (!strategy) {
    return (
      <DashboardShell activeNav="admin-strategies" title="Link Data to Strategy" subtitle="Strategy not found">
        <p className="text-red-600">Strategy not found</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      activeNav="admin-strategies"
      title="Link Data to Strategy"
      subtitle={`Strategy: ${strategy.strategyKey}`}
      actions={
        <button
          onClick={() => router.push('/admin/strategies')}
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Strategies
        </button>
      }
    >

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded p-4 mb-4 text-green-800">
          <p className="font-semibold">Linking Complete</p>
          <p>
            Linked: {result.linked}, Skipped: {result.skipped}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {/* Auto-link Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Automatic Linking</h2>
          <p className="text-sm text-gray-600 mb-4">
            Automatically link positions and trades to this strategy based on heuristics (date
            proximity, account matching, etc.)
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => handleAutoLink('positions')}
              disabled={linking}
              className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {linking ? 'Linking...' : 'Auto-Link Positions'}
            </button>
            <button
              onClick={() => handleAutoLink('trades')}
              disabled={linking}
              className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {linking ? 'Linking...' : 'Auto-Link Trades'}
            </button>
          </div>
        </div>

        {/* Manual Linking Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Manual Linking</h2>
          <p className="text-sm text-gray-600 mb-4">
            Manually select and link specific positions or trades. (Note: This requires API
            endpoints to fetch unlinked items - currently shows placeholder)
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-yellow-800 text-sm">
            <p className="font-semibold mb-2">Note:</p>
            <p>
              For manual linking, you'll need to query unlinked positions/trades from the database
              or add API endpoints. The auto-linking feature above should work for most cases.
            </p>
            <p className="mt-2">
              You can also link via API directly:
            </p>
            <code className="block mt-2 p-2 bg-yellow-100 rounded text-xs">
              POST /api/strategies/link
              {`\n`}
              {`{ "type": "position", "positionId": "...", "strategyId": "${strategyId}" }`}
            </code>
          </div>
        </div>

        {/* Info Section */}
        <div className="bg-blue-50 border border-blue-200 rounded p-4 text-blue-800 text-sm">
          <p className="font-semibold mb-2">How Linking Works:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Auto-link positions:</strong> Links positions created within 30 days of
              strategy opened_at date
            </li>
            <li>
              <strong>Auto-link trades:</strong> Links trades executed within 30 days of strategy
              opened_at date
            </li>
            <li>
              <strong>Manual link:</strong> Directly assign specific positions/trades to a strategy
            </li>
          </ul>
          <p className="mt-3">
            After linking, run the recompute endpoint to update strategy metrics and triage records.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}

