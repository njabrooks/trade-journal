'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle, RefreshCw } from 'lucide-react';
import { ThesisTriageTableRow, type ThesisTriageRecord } from './ThesisTriageTableRow';
import { SortableHeader } from './SortableHeader';
import { Button } from '@/components/ui/button';

interface ThesisTriageTableProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
}

type StatusFilter = 'needs_action' | 'all';

// Severities that require action
const ACTION_SEVERITIES = ['urgent', 'attention'];

export function ThesisTriageTable({ thesisId, thesisType }: ThesisTriageTableProps) {
  const [allRecords, setAllRecords] = useState<ThesisTriageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('needs_action');

  const fetchTriage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/thesis-triage?thesisId=${thesisId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch triage records');
      }
      const data = await response.json();
      // Filter to show only active records (status not 'done')
      const activeRecords = data.records.filter(
        (r: ThesisTriageRecord) => r.status !== 'done'
      );
      setAllRecords(activeRecords);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [thesisId]);

  useEffect(() => {
    fetchTriage();
  }, [fetchTriage, refreshKey]);

  // Apply client-side filtering
  const records = useMemo(() => {
    if (statusFilter === 'needs_action') {
      return allRecords.filter((r) => ACTION_SEVERITIES.includes(r.severity));
    }
    return allRecords;
  }, [allRecords, statusFilter]);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleActionComplete = () => {
    // Refresh the list after an action
    handleRefresh();
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-slate-200 border-t-slate-600"></div>
        <p className="mt-2 text-sm text-slate-500">Loading triage records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={handleRefresh}
        >
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  // Show empty state for "needs action" filter - but allow switching to "all"
  const showEmptyNeedsAction = statusFilter === 'needs_action' && records.length === 0;
  const showEmptyAll = statusFilter === 'all' && records.length === 0;

  return (
    <div className="space-y-3">
      {/* Quick Filter Bar */}
      <div className="flex items-center gap-2">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('all')}
        >
          All Triage
        </Button>
        <Button
          variant={statusFilter === 'needs_action' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('needs_action')}
        >
          Needs Action
        </Button>

        <div className="ml-auto text-sm text-slate-600">
          Showing {records.length} of {allRecords.length} items
        </div>
      </div>

      {/* Empty States */}
      {showEmptyNeedsAction && (
        <div className="py-8 text-center">
          <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
          <p className="text-sm text-slate-600 font-medium">No urgent alerts</p>
          <p className="text-xs text-slate-400 mt-1">
            All high-priority triage items have been addressed.
            {allRecords.length > 0 && (
              <button
                onClick={() => setStatusFilter('all')}
                className="text-blue-600 hover:underline ml-1"
              >
                View all {allRecords.length} items
              </button>
            )}
          </p>
        </div>
      )}

      {showEmptyAll && (
        <div className="py-8 text-center">
          <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
          <p className="text-sm text-slate-600 font-medium">No pending alerts</p>
          <p className="text-xs text-slate-400 mt-1">All triage items have been addressed</p>
        </div>
      )}

      {/* Table */}
      {records.length > 0 && (
        <div className="overflow-x-auto -mx-4 -mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <SortableHeader column="displayTitle" className="text-left">
                  {thesisType === 'asset' ? 'Ticker' : 'Thesis'}
                </SortableHeader>
                <SortableHeader column="triageRule" className="text-left">
                  Alert Type
                </SortableHeader>
                <SortableHeader column="severity" className="text-center">
                  Severity
                </SortableHeader>
                <SortableHeader column="thesisType" className="text-center">
                  Type
                </SortableHeader>
                <SortableHeader column="createdAt" className="text-center">
                  Date
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <ThesisTriageTableRow
                  key={record.id}
                  record={record}
                  onActionComplete={handleActionComplete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
