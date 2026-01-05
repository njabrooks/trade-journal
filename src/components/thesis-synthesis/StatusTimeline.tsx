'use client';

import { useState } from 'react';
import {
  Clock,
  AlertTriangle,
  Eye,
  CheckCircle2,
  Archive,
  ExternalLink,
  User,
  Bot,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { ValidationStatusHistory } from '@/db/schema';

interface StatusTimelineProps {
  history: ValidationStatusHistory[];
  isLoading?: boolean;
}

export function StatusTimeline({ history, isLoading }: StatusTimelineProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedItems(next);
  };

  const statusIcons: Record<string, React.ReactNode> = {
    not_triggered: <Clock className="w-4 h-4 text-slate-400" />,
    monitoring: <Eye className="w-4 h-4 text-blue-500" />,
    triggered: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    superseded: <Archive className="w-4 h-4 text-slate-300" />,
  };

  const statusColors: Record<string, string> = {
    not_triggered: 'border-slate-300 bg-slate-50',
    monitoring: 'border-blue-400 bg-blue-50',
    triggered: 'border-amber-400 bg-amber-50',
    superseded: 'border-slate-200 bg-slate-50',
  };

  const confidenceColors: Record<string, string> = {
    low: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-emerald-100 text-emerald-700',
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

    if (days > 30) return formatTimestamp(date);
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-slate-200 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No status history recorded yet.</p>
        <p className="text-xs text-slate-400 mt-1">
          Status changes will appear here as evidence is recorded.
        </p>
      </div>
    );
  }

  // Sort by timestamp descending (most recent first)
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100">
        <h4 className="text-sm font-semibold text-slate-900">Status History</h4>
        <p className="text-xs text-slate-500 mt-0.5">
          {history.length} status change{history.length !== 1 ? 's' : ''} recorded
        </p>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-200" />

        <div className="divide-y divide-slate-100">
          {sortedHistory.map((record, index) => {
            const isExpanded = expandedItems.has(record.id);
            const evidence = record.evidence as {
              source: string;
              summary: string;
              link?: string;
              rawContent?: string;
            } | null;

            const isFirst = index === 0;
            const statusChanged = record.previousStatus !== record.newStatus;

            return (
              <div key={record.id} className="relative px-4 py-3">
                {/* Timeline node */}
                <div
                  className={`absolute left-4 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    statusColors[record.newStatus] || 'border-slate-300 bg-white'
                  } ${isFirst ? 'ring-2 ring-offset-2 ring-blue-200' : ''}`}
                >
                  {statusIcons[record.newStatus]}
                </div>

                {/* Content */}
                <div className="ml-10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {/* Status change header */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusChanged ? (
                          <>
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${
                                statusColors[record.previousStatus || 'not_triggered']
                              }`}
                            >
                              {record.previousStatus?.replace('_', ' ') || 'initial'}
                            </span>
                            <span className="text-slate-400">&rarr;</span>
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${
                                statusColors[record.newStatus]
                              }`}
                            >
                              {record.newStatus.replace('_', ' ')}
                            </span>
                          </>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${
                              statusColors[record.newStatus]
                            }`}
                          >
                            {record.newStatus.replace('_', ' ')} (observation recorded)
                          </span>
                        )}

                        {/* Confidence */}
                        <span
                          className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${
                            confidenceColors[record.confidence] || 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {record.confidence} confidence
                        </span>

                        {/* Assessed by */}
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          {record.assessedBy === 'claude' ? (
                            <Bot className="w-3 h-3" />
                          ) : (
                            <User className="w-3 h-3" />
                          )}
                          {record.assessedBy}
                        </span>
                      </div>

                      {/* Timestamp */}
                      <p className="text-xs text-slate-400 mt-1">
                        {formatRelativeTime(record.timestamp)}
                        <span className="mx-1">&bull;</span>
                        {formatTimestamp(record.timestamp)}
                      </p>
                    </div>

                    {/* Expand button */}
                    <button
                      onClick={() => toggleItem(record.id)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Evidence (always show summary) */}
                  {evidence && (
                    <div className="mt-2 text-sm text-slate-700">
                      <span className="text-xs text-slate-500">Source: </span>
                      <span className="font-medium">{evidence.source}</span>
                      {!isExpanded && (
                        <p className="mt-1 text-slate-600 line-clamp-2">{evidence.summary}</p>
                      )}
                    </div>
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      {evidence && (
                        <>
                          <div className="bg-slate-50 rounded-md p-3">
                            <h6 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                              Evidence Summary
                            </h6>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">
                              {evidence.summary}
                            </p>
                          </div>

                          {evidence.link && (
                            <a
                              href={evidence.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View Source
                            </a>
                          )}
                        </>
                      )}

                      {/* User action */}
                      {record.userActionRequired && (
                        <div className="bg-amber-50 rounded-md p-3 border border-amber-100">
                          <h6 className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                            Action Required
                          </h6>
                          {record.userActionTaken ? (
                            <p className="text-sm text-amber-900">
                              <CheckCircle2 className="w-3 h-3 inline mr-1 text-green-600" />
                              {record.userActionTaken}
                              {record.userActionTimestamp && (
                                <span className="ml-2 text-xs text-amber-600">
                                  ({formatTimestamp(record.userActionTimestamp)})
                                </span>
                              )}
                            </p>
                          ) : (
                            <p className="text-sm text-amber-700">
                              <AlertTriangle className="w-3 h-3 inline mr-1" />
                              Action pending
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
