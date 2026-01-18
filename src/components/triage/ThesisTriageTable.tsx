'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, RefreshCw } from 'lucide-react';
import { ThesisTriageTableRow, type ThesisTriageRecord } from './ThesisTriageTableRow';
import { SortableHeader } from './SortableHeader';
import { Button } from '@/components/ui/button';

interface ThesisTriageTableProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
}

export function ThesisTriageTable({ thesisId, thesisType }: ThesisTriageTableProps) {
  const [records, setRecords] = useState<ThesisTriageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
      setRecords(activeRecords);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [thesisId]);

  useEffect(() => {
    fetchTriage();
  }, [fetchTriage, refreshKey]);

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

  if (records.length === 0) {
    return (
      <div className="py-8 text-center">
        <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
        <p className="text-sm text-slate-600 font-medium">No pending alerts</p>
        <p className="text-xs text-slate-400 mt-1">All triage items have been addressed</p>
      </div>
    );
  }

  return (
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
            <SortableHeader column="urgency" className="text-center">
              Urgency
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
  );
}
