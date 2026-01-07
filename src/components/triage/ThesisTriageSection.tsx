'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/formatters';
import type { TriageAIAnalysis, TriageContentSummary, TriageMatchedResult } from '@/db/schema';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FileText,
  ExternalLink,
  X,
  Check,
  Filter,
  Terminal,
  Sparkles,
  Link2,
  TrendingUp,
  TrendingDown,
  Minus,
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
  contentSummary?: TriageContentSummary;
  aiAnalysis?: TriageAIAnalysis;
  matchedResults?: TriageMatchedResult[];
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

const EVIDENCE_TYPE_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  strong_validation: { icon: <TrendingUp className="h-4 w-4" />, color: 'text-green-600 bg-green-50' },
  weak_validation: { icon: <TrendingUp className="h-4 w-4" />, color: 'text-green-500 bg-green-50' },
  neutral: { icon: <Minus className="h-4 w-4" />, color: 'text-slate-500 bg-slate-50' },
  weak_invalidation: { icon: <TrendingDown className="h-4 w-4" />, color: 'text-orange-500 bg-orange-50' },
  strong_invalidation: { icon: <TrendingDown className="h-4 w-4" />, color: 'text-red-600 bg-red-50' },
};

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full border transition-colors ${
        active
          ? 'bg-blue-100 text-blue-800 border-blue-300'
          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
      }`}
    >
      {label} <span className="text-slate-400">({count})</span>
    </button>
  );
}

function TriageRecordDetail({
  record,
  onAction,
}: {
  record: ThesisTriageRecord;
  onAction: (id: string, action: 'actioned' | 'dismissed') => void;
}) {
  const contentSummary = record.contentSummary;
  const aiAnalysis = record.aiAnalysis;
  const matchedResults = record.matchedResults || [];

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-4">
      {/* AI Analysis Summary */}
      {aiAnalysis?.summary && (
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            AI Analysis
          </div>
          <p className="text-sm text-slate-600">{aiAnalysis.summary}</p>
        </div>
      )}

      {/* Validation Points Affected */}
      {aiAnalysis?.validationPointsAffected && aiAnalysis.validationPointsAffected.length > 0 && (
        <div className="bg-white rounded-lg border p-3">
          <div className="text-sm font-medium text-slate-700 mb-2">
            Validation Points Affected
          </div>
          <div className="space-y-2">
            {aiAnalysis.validationPointsAffected.map((vp, idx) => {
              const { icon, color } = EVIDENCE_TYPE_ICONS[vp.evidenceType] || EVIDENCE_TYPE_ICONS.neutral;
              return (
                <div key={idx} className={`flex items-start gap-2 p-2 rounded ${color}`}>
                  {icon}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{vp.pointStatement}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {vp.evidenceType.replace('_', ' ')} • {vp.confidence} confidence
                    </p>
                    {vp.recommendedAction && (
                      <p className="text-xs text-slate-600 mt-1">{vp.recommendedAction}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Key Findings */}
      {aiAnalysis?.keyFindings && aiAnalysis.keyFindings.length > 0 && (
        <div className="bg-white rounded-lg border p-3">
          <div className="text-sm font-medium text-slate-700 mb-2">Key Findings</div>
          <ul className="text-sm text-slate-600 space-y-1">
            {aiAnalysis.keyFindings.map((finding, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-slate-400">•</span>
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Content Summary */}
      {contentSummary && (
        <div className="bg-white rounded-lg border p-3">
          <div className="text-sm font-medium text-slate-700 mb-2">Content Summary</div>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div>Items scanned: {contentSummary.totalItemsScanned}</div>
            <div>Relevant items: {contentSummary.relevantItemsFound}</div>
            <div className="col-span-2">
              Sources: {contentSummary.sources?.join(', ') || 'N/A'}
            </div>
          </div>
        </div>
      )}

      {/* Matched Results */}
      {matchedResults.length > 0 && (
        <div className="bg-white rounded-lg border p-3">
          <div className="text-sm font-medium text-slate-700 mb-2">
            Matched Results ({matchedResults.length})
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {matchedResults.slice(0, 5).map((result, idx) => (
              <div key={idx} className="text-sm border-l-2 border-slate-200 pl-2">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  {result.title}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <p className="text-xs text-slate-500 line-clamp-2">{result.snippet}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                  <span className="px-1 py-0.5 bg-slate-100 rounded">
                    {result.queryType}
                  </span>
                  <span>Score: {result.matchScore}</span>
                  {result.date && <span>{result.date}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Skill Invocation */}
      {record.suggestedSkill && (
        <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 mb-2">
            <Terminal className="h-4 w-4" />
            Suggested Action
          </div>
          <p className="text-sm text-emerald-700 mb-2">
            Run the <code className="px-1.5 py-0.5 bg-emerald-100 rounded font-mono text-emerald-800">{record.suggestedSkill}</code> skill in Claude Code to analyze this content against the thesis validation points.
          </p>
          <div className="bg-emerald-100 rounded p-2 text-xs font-mono text-emerald-800">
            {record.suggestedSkill} {record.thesisId.substring(0, 8)}...
          </div>
        </div>
      )}

      {/* Next Steps */}
      {aiAnalysis?.suggestedNextSteps && aiAnalysis.suggestedNextSteps.length > 0 && (
        <div className="bg-white rounded-lg border p-3">
          <div className="text-sm font-medium text-slate-700 mb-2">Suggested Next Steps</div>
          <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
            {aiAnalysis.suggestedNextSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
        <button
          onClick={() => onAction(record.id, 'dismissed')}
          className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg flex items-center gap-1"
        >
          <X className="h-4 w-4" />
          Dismiss
        </button>
        <button
          onClick={() => onAction(record.id, 'actioned')}
          className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1"
        >
          <Check className="h-4 w-4" />
          Mark Actioned
        </button>
      </div>
    </div>
  );
}

export function ThesisTriageSection() {
  const [records, setRecords] = useState<ThesisTriageRecord[]>([]);
  const [counts, setCounts] = useState<ThesisTriageCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [thesisTypeFilter, setThesisTypeFilter] = useState<string[]>([]);
  const [lifecycleFilter, setLifecycleFilter] = useState<string[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      severityFilter.forEach((s) => params.append('severity', s));
      thesisTypeFilter.forEach((t) => params.append('thesisType', t));
      lifecycleFilter.forEach((l) => params.append('lifecycleStage', l));

      const response = await fetch(`/api/thesis-triage?${params.toString()}`);
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
  }, [severityFilter, thesisTypeFilter, lifecycleFilter]);

  const handleAction = async (id: string, action: 'actioned' | 'dismissed') => {
    try {
      const response = await fetch(`/api/thesis-triage/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });
      if (!response.ok) throw new Error('Failed to update');

      // Refresh data
      fetchData();
      setExpandedId(null);
    } catch (err) {
      console.error('Failed to update triage record:', err);
    }
  };

  const toggleFilter = (
    filter: string[],
    setFilter: (f: string[]) => void,
    value: string
  ) => {
    if (filter.includes(value)) {
      setFilter(filter.filter((f) => f !== value));
    } else {
      setFilter([...filter, value]);
    }
  };

  if (loading && records.length === 0) {
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

  const hasActiveFilters = severityFilter.length > 0 || thesisTypeFilter.length > 0 || lifecycleFilter.length > 0;

  if (records.length === 0 && !hasActiveFilters) {
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`text-sm px-2 py-1 rounded flex items-center gap-1 ${
              showFilters || hasActiveFilters
                ? 'text-blue-600 bg-blue-50'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Filter className="h-4 w-4" />
            {hasActiveFilters && (
              <span className="bg-blue-600 text-white text-xs px-1.5 rounded-full">
                {severityFilter.length + thesisTypeFilter.length + lifecycleFilter.length}
              </span>
            )}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && counts && (
        <div className="border-b px-4 py-3 bg-slate-50 space-y-3">
          {/* Severity Filter */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Severity</div>
            <div className="flex flex-wrap gap-1">
              {['critical', 'high', 'medium', 'low', 'info'].map((sev) => (
                <FilterChip
                  key={sev}
                  label={sev}
                  count={counts.severity[sev] || 0}
                  active={severityFilter.includes(sev)}
                  onClick={() => toggleFilter(severityFilter, setSeverityFilter, sev)}
                />
              ))}
            </div>
          </div>

          {/* Thesis Type Filter */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Thesis Type</div>
            <div className="flex flex-wrap gap-1">
              {['macro', 'asset'].map((type) => (
                <FilterChip
                  key={type}
                  label={type === 'macro' ? 'Macro' : 'Asset'}
                  count={counts.thesisType[type] || 0}
                  active={thesisTypeFilter.includes(type)}
                  onClick={() => toggleFilter(thesisTypeFilter, setThesisTypeFilter, type)}
                />
              ))}
            </div>
          </div>

          {/* Lifecycle Stage Filter */}
          {Object.keys(counts.lifecycleStage).length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">Lifecycle Stage</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(counts.lifecycleStage).map(([stage, count]) => (
                  <FilterChip
                    key={stage}
                    label={stage.replace('_', ' ')}
                    count={count}
                    active={lifecycleFilter.includes(stage)}
                    onClick={() => toggleFilter(lifecycleFilter, setLifecycleFilter, stage)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSeverityFilter([]);
                setThesisTypeFilter([]);
                setLifecycleFilter([]);
              }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Records */}
      {records.length === 0 && hasActiveFilters ? (
        <div className="p-8 text-center text-slate-500">
          <p>No records match the current filters.</p>
          <button
            onClick={() => {
              setSeverityFilter([]);
              setThesisTypeFilter([]);
              setLifecycleFilter([]);
            }}
            className="text-sm text-blue-600 hover:text-blue-800 mt-2"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="divide-y">
          {records.map((record) => (
            <div key={record.id}>
              <div
                className={`p-4 transition-colors cursor-pointer ${
                  expandedId === record.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
                onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Title and type */}
                    <div className="flex items-center gap-2 mb-1">
                      {URGENCY_ICONS[record.urgency] || URGENCY_ICONS.when_convenient}
                      <Link
                        href={`/${record.thesisType === 'macro' ? 'macro-theses' : 'asset-theses'}/${record.thesisId}`}
                        className="font-medium text-slate-900 hover:text-blue-600 truncate"
                        onClick={(e) => e.stopPropagation()}
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
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-mono flex items-center gap-1">
                          <Terminal className="h-3 w-3" />
                          {record.suggestedSkill}
                        </span>
                      )}
                      <span className="text-slate-400">
                        {formatRelativeTime(record.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Expand indicator */}
                  <div className="shrink-0 p-2 text-slate-400">
                    {expandedId === record.id ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === record.id && (
                <TriageRecordDetail record={record} onAction={handleAction} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
