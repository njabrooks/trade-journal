'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/formatters';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  ChevronRight,
  RefreshCw,
  FileText,
} from 'lucide-react';

interface ThesisTriageRecord {
  id: string;
  createdAt: string;
  thesisId: string;
  thesisType: string;
  thesisTitle: string;
  triggerType: string;
  triggerSource: string;
  severity: string;
  urgency: string;
  status: string;
  lifecycleStage: string | null;
  suggestedSkill: string | null;
  actionRequired: string | null;
  userNotes: string | null;
  completedAt: string | null;
}

interface ThesisTriageCounts {
  status: Record<string, number>;
  severity: Record<string, number>;
  thesisType: Record<string, number>;
  lifecycleStage: Record<string, number>;
  total: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  info: 'bg-slate-100 text-slate-800 border-slate-200',
};

const URGENCY_ICONS: Record<string, React.ReactNode> = {
  immediate: <AlertTriangle className="h-4 w-4 text-red-500" />,
  today: <Clock className="h-4 w-4 text-orange-500" />,
  this_week: <Clock className="h-4 w-4 text-yellow-500" />,
  when_convenient: <Clock className="h-4 w-4 text-slate-400" />,
};

export function ThesisTriageSection() {
  const [records, setRecords] = useState<ThesisTriageRecord[]>([]);
  const [counts, setCounts] = useState<ThesisTriageCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/thesis-triage');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setRecords(data.records);
      setCounts(data.counts);
      setError(null);
    } catch (err) {
      setError('Failed to load thesis triage queue');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-slate-200 rounded"></div>
          <div className="space-y-2">
            <div className="h-16 bg-slate-100 rounded"></div>
            <div className="h-16 bg-slate-100 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchData}
          className="mt-2 text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-3" />
        <h3 className="text-lg font-medium text-slate-900">All caught up!</h3>
        <p className="text-sm text-slate-500 mt-1">
          No thesis triage items require attention.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-600" />
          <h2 className="font-semibold text-slate-900">Thesis Workflow</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {counts?.total ?? records.length}
          </span>
        </div>
        <button
          onClick={fetchData}
          className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Records */}
      <div className="divide-y">
        {records.map((record) => (
          <div
            key={record.id}
            className="p-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Title and type */}
                <div className="flex items-center gap-2 mb-1">
                  {URGENCY_ICONS[record.urgency] || URGENCY_ICONS.when_convenient}
                  <Link
                    href={`/${record.thesisType === 'macro' ? 'macro-theses' : 'asset-theses'}/${record.thesisId}`}
                    className="font-medium text-slate-900 hover:text-blue-600 truncate"
                  >
                    {record.thesisTitle}
                  </Link>
                  <span className="text-xs text-slate-400">
                    {record.thesisType === 'macro' ? 'Macro' : 'Asset'}
                  </span>
                </div>

                {/* Action required */}
                {record.actionRequired && (
                  <p className="text-sm text-slate-600 mb-2">
                    {record.actionRequired}
                  </p>
                )}

                {/* Metadata */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded-full border ${
                      SEVERITY_COLORS[record.severity] || SEVERITY_COLORS.info
                    }`}
                  >
                    {record.severity}
                  </span>
                  {record.lifecycleStage && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                      {record.lifecycleStage.replace('_', ' ')}
                    </span>
                  )}
                  {record.suggestedSkill && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-mono">
                      {record.suggestedSkill}
                    </span>
                  )}
                  <span className="text-slate-400">
                    {formatRelativeTime(record.createdAt)}
                  </span>
                </div>
              </div>

              {/* Action link */}
              <Link
                href={`/${record.thesisType === 'macro' ? 'macro-theses' : 'asset-theses'}/${record.thesisId}`}
                className="shrink-0 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
