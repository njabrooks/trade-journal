'use client';

import { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  User,
  Bot,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import type { MonitoringEvent, MonitoringSpec } from '@/db/schema';

interface MonitoringEventsLogProps {
  events: Array<{
    event: MonitoringEvent;
    spec: MonitoringSpec;
  }>;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function MonitoringEventsLog({
  events,
  isLoading,
  onRefresh,
}: MonitoringEventsLogProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [filterSource, setFilterSource] = useState<string>('all');

  const toggleEvent = (id: string) => {
    const next = new Set(expandedEvents);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedEvents(next);
  };

  const dataSourceIcons: Record<string, { icon: string; label: string; color: string }> = {
    fred: { icon: '📊', label: 'FRED', color: 'bg-purple-100 text-purple-700' },
    news: { icon: '📰', label: 'News', color: 'bg-blue-100 text-blue-700' },
    price_iv: { icon: '📈', label: 'Price/IV', color: 'bg-green-100 text-green-700' },
    sec_filings: { icon: '📄', label: 'SEC', color: 'bg-amber-100 text-amber-700' },
  };

  const formatTimestamp = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days > 7) return formatTimestamp(date);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  // Get unique data sources for filter
  const uniqueSources = Array.from(new Set(events.map((e) => e.event.dataSource)));

  // Filter events
  const filteredEvents =
    filterSource === 'all'
      ? events
      : events.filter((e) => e.event.dataSource === filterSource);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-slate-200 rounded" />
              <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No monitoring events recorded yet.</p>
        <p className="text-xs text-slate-400 mt-1">
          Events will appear here when monitoring checks are performed.
        </p>
      </div>
    );
  }

  // Sort by checked time descending
  const sortedEvents = [...filteredEvents].sort(
    (a, b) => new Date(b.event.checkedAt).getTime() - new Date(a.event.checkedAt).getTime()
  );

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Monitoring Events</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {events.length} event{events.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Source filter */}
            {uniqueSources.length > 1 && (
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="text-xs border-slate-200 rounded px-2 py-1"
              >
                <option value="all">All Sources</option>
                {uniqueSources.map((source) => (
                  <option key={source} value={source}>
                    {dataSourceIcons[source]?.label || source}
                  </option>
                ))}
              </select>
            )}

            {/* Refresh button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"
                title="Refresh events"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {sortedEvents.map(({ event, spec }) => {
          const isExpanded = expandedEvents.has(event.id);
          const sourceInfo = dataSourceIcons[event.dataSource] || {
            icon: '🔍',
            label: event.dataSource,
            color: 'bg-slate-100 text-slate-600',
          };
          const resultsSummary = event.resultsSummary as Array<{
            title: string;
            date: string;
            source: string;
            snippet: string;
            link?: string;
          }>;

          return (
            <div key={event.id} className="px-4 py-3">
              {/* Event header */}
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleEvent(event.id)}
                  className="mt-0.5 text-slate-400 hover:text-slate-600"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Data source badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${sourceInfo.color}`}
                    >
                      <span>{sourceInfo.icon}</span>
                      {sourceInfo.label}
                    </span>

                    {/* Results count */}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-slate-600 bg-slate-100 rounded">
                      {event.resultsCount} result{event.resultsCount !== 1 ? 's' : ''}
                    </span>

                    {/* Triggered status change badge */}
                    {event.triggeredStatusChange && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
                        <AlertCircle className="w-3 h-3" />
                        Triggered Update
                      </span>
                    )}

                    {/* Checked by */}
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      {event.checkedBy === 'claude' ? (
                        <Bot className="w-3 h-3" />
                      ) : event.checkedBy === 'scheduled' ? (
                        <Calendar className="w-3 h-3" />
                      ) : (
                        <User className="w-3 h-3" />
                      )}
                      {event.checkedBy}
                    </span>
                  </div>

                  {/* Timestamp */}
                  <p className="text-xs text-slate-400 mt-1">
                    {formatRelativeTime(event.checkedAt)}
                    <span className="mx-1">&bull;</span>
                    {formatTimestamp(event.checkedAt)}
                  </p>

                  {/* Keywords from spec */}
                  {!isExpanded && (
                    <div className="flex items-center gap-1 mt-1.5">
                      {(spec.keywords as string[]).slice(0, 3).map((keyword) => (
                        <span
                          key={keyword}
                          className="inline-flex px-1.5 py-0.5 text-xs text-slate-500 bg-slate-50 rounded"
                        >
                          {keyword}
                        </span>
                      ))}
                      {(spec.keywords as string[]).length > 3 && (
                        <span className="text-xs text-slate-400">
                          +{(spec.keywords as string[]).length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Relevance score */}
                {(event.userRelevanceScore !== null || event.claudeRelevanceScore !== null) && (
                  <div className="text-right">
                    {event.userRelevanceScore !== null && (
                      <div className="text-xs">
                        <span className="text-slate-500">User: </span>
                        <span className="font-medium text-slate-700">
                          {event.userRelevanceScore}/10
                        </span>
                      </div>
                    )}
                    {event.claudeRelevanceScore !== null && (
                      <div className="text-xs">
                        <span className="text-slate-500">AI: </span>
                        <span className="font-medium text-slate-700">
                          {Number(event.claudeRelevanceScore).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-3 ml-7 space-y-3">
                  {/* Assessment notes */}
                  {(event.userAssessmentNotes || event.claudeAssessmentNotes) && (
                    <div className="bg-slate-50 rounded-md p-3">
                      <h6 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                        Assessment Notes
                      </h6>
                      {event.userAssessmentNotes && (
                        <p className="text-sm text-slate-700">
                          <User className="w-3 h-3 inline mr-1" />
                          {event.userAssessmentNotes}
                        </p>
                      )}
                      {event.claudeAssessmentNotes && (
                        <p className="text-sm text-slate-600 mt-1">
                          <Bot className="w-3 h-3 inline mr-1" />
                          {event.claudeAssessmentNotes}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Query params */}
                  <div className="bg-slate-50 rounded-md p-3">
                    <h6 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                      Query Parameters
                    </h6>
                    <pre className="text-xs text-slate-600 overflow-x-auto">
                      {JSON.stringify(event.queryParams, null, 2)}
                    </pre>
                  </div>

                  {/* Results summary */}
                  {resultsSummary && resultsSummary.length > 0 && (
                    <div>
                      <h6 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                        Results ({resultsSummary.length})
                      </h6>
                      <div className="space-y-2">
                        {resultsSummary.map((result, idx) => (
                          <div
                            key={idx}
                            className="bg-white border border-slate-200 rounded-md p-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 line-clamp-1">
                                  {result.title}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {result.source}
                                  {result.date && (
                                    <>
                                      <span className="mx-1">&bull;</span>
                                      {result.date}
                                    </>
                                  )}
                                </p>
                                {result.snippet && (
                                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                                    {result.snippet}
                                  </p>
                                )}
                              </div>
                              {result.link && (
                                <a
                                  href={result.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 p-1 text-blue-500 hover:text-blue-700"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {resultsSummary && resultsSummary.length === 0 && (
                    <div className="text-center py-3 text-sm text-slate-500">
                      <Search className="w-4 h-4 inline mr-1" />
                      No results found in this check
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredEvents.length === 0 && filterSource !== 'all' && (
        <div className="px-4 py-6 text-center text-sm text-slate-500">
          No events from {dataSourceIcons[filterSource]?.label || filterSource} source.
        </div>
      )}
    </div>
  );
}
