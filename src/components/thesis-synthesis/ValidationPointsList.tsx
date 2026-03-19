'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Clock,
  ChevronDown,
  ChevronRight,
  Target,
  Scale,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ValidationPoint } from '@/db/schema';

interface ValidationPointsListProps {
  validationPoints: ValidationPoint[];
  thesisId: string;
  thesisType: 'macro' | 'asset';
  onUpdateStatus?: (pointId: string) => void;
  onViewHistory?: (pointId: string) => void;
  onConvertToExplicit?: (point: ValidationPoint) => void;
}

export function ValidationPointsList({
  validationPoints,
  thesisId,
  thesisType,
  onUpdateStatus,
  onViewHistory,
  onConvertToExplicit,
}: ValidationPointsListProps) {
  const [expandedPoints, setExpandedPoints] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'confirmation' | 'invalidation'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'active' | 'complete' | 'rejected'>('all');

  const togglePoint = (id: string) => {
    const next = new Set(expandedPoints);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedPoints(next);
  };

  const filteredPoints = validationPoints.filter((point) => {
    if (filterType !== 'all' && point.type !== filterType) return false;
    if (filterStatus !== 'all' && point.status !== filterStatus) return false;
    return true;
  });

  const confirmationCount = validationPoints.filter((p) => p.type === 'confirmation').length;
  const invalidationCount = validationPoints.filter((p) => p.type === 'invalidation').length;
  const completeCount = validationPoints.filter((p) => p.status === 'complete').length;
  const activeCount = validationPoints.filter((p) => p.status === 'active').length;

  const statusIcons: Record<string, React.ReactNode> = {
    draft: <Clock className="w-4 h-4 text-purple-400" />,
    active: <Eye className="w-4 h-4 text-blue-500" />,
    complete: <AlertTriangle className="w-4 h-4 text-emerald-500" />,
    rejected: <XCircle className="w-4 h-4 text-slate-300" />,
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-purple-100 text-purple-700 dark:text-purple-300 dark:bg-purple-900/30 dark:text-purple-300',
    active: 'bg-blue-100 text-blue-700 dark:text-blue-300 dark:bg-blue-900/30 dark:text-blue-300',
    complete: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    rejected: 'bg-muted text-muted-foreground',
  };

  const importanceColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    significant: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    supporting: 'bg-muted text-muted-foreground border',
  };

  const categoryIcons: Record<string, React.ReactNode> = {
    data_driven: <Target className="w-3 h-3" />,
    judgment: <Scale className="w-3 h-3" />,
  };

  if (validationPoints.length === 0) {
    return (
      <div className="bg-card rounded-lg border border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No validation points defined yet.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Use <code className="px-1 bg-muted rounded">/build-core-argument</code> to create articulation with validation points.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            Validation Points
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3 h-3" />
              {confirmationCount} confirmation
            </span>
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              {invalidationCount} invalidation
            </span>
            {completeCount > 0 && (
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                {completeCount} complete
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Type:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="text-xs border rounded px-1.5 py-0.5"
            >
              <option value="all">All</option>
              <option value="confirmation">Confirmation</option>
              <option value="invalidation">Invalidation</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="text-xs border rounded px-1.5 py-0.5"
            >
              <option value="all">All ({validationPoints.length})</option>
              <option value="draft">Draft</option>
              <option value="active">Active ({activeCount})</option>
              <option value="complete">Complete ({completeCount})</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Points List */}
      <div className="divide-y divide-slate-100">
        {filteredPoints.map((point) => {
          const isExpanded = expandedPoints.has(point.id);
          const explicitDetails = point.explicitDetails as {
            metric?: string;
            threshold?: string;
            dataSources?: string[];
            monitoringFrequency?: string;
          } | null;
          const judgmentDetails = point.judgmentDetails as {
            observableProxies?: string[];
            judgmentCriteria?: string;
            reviewFrequency?: string;
          } | null;
          const responseProtocol = point.responseProtocol as {
            description?: string;
            escalation?: string;
            linkedStrategies?: string[];
          };

          return (
            <div key={point.id} className="px-4 py-3">
              {/* Point Header */}
              <div className="flex items-start gap-3">
                <button
                  onClick={() => togglePoint(point.id)}
                  className="mt-0.5 text-muted-foreground hover:text-muted-foreground"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    {/* Type badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${
                        point.type === 'confirmation'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}
                    >
                      {point.type === 'confirmation' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {point.type === 'confirmation' ? 'Confirmation' : 'Invalidation'}
                    </span>

                    {/* Importance badge */}
                    <span
                      className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded border ${
                        importanceColors[point.importance]
                      }`}
                    >
                      {point.importance}
                    </span>

                    {/* Category badge */}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-muted-foreground bg-muted rounded">
                      {categoryIcons[point.category]}
                      {point.category.replace('_', ' ')}
                    </span>

                    {/* Status badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${
                        statusColors[point.status]
                      }`}
                    >
                      {statusIcons[point.status]}
                      {point.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Statement */}
                  <p className="mt-1.5 text-sm text-foreground">{point.statement}</p>

                  {/* Rationale (if not expanded) */}
                  {!isExpanded && point.rationale && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {point.rationale}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Convert to Data-Driven - only for judgment-based signals */}
                  {onConvertToExplicit && point.category === 'judgment' && point.status !== 'rejected' && (
                    <button
                      onClick={() => onConvertToExplicit(point)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded"
                      title="Convert to data-driven signal with measurable triggers"
                    >
                      <Zap className="w-3 h-3" />
                      Make Data-Driven
                    </button>
                  )}
                  {onUpdateStatus && point.status !== 'rejected' && (
                    <button
                      onClick={() => onUpdateStatus(point.id)}
                      className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                    >
                      Update Status
                    </button>
                  )}
                  {onViewHistory && (
                    <button
                      onClick={() => onViewHistory(point.id)}
                      className="px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded"
                    >
                      History
                    </button>
                  )}
                  <Link
                    href={`/${thesisType === 'macro' ? 'macro-theses' : 'asset-theses'}/${thesisId}/signals/${point.id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Details
                  </Link>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-3 ml-7 space-y-3">
                  {/* Rationale */}
                  {point.rationale && (
                    <div>
                      <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Rationale
                      </h5>
                      <p className="mt-1 text-sm text-foreground">{point.rationale}</p>
                    </div>
                  )}

                  {/* Data-Driven Details */}
                  {point.category === 'data_driven' && explicitDetails && (
                    <div className="bg-muted rounded-md p-3">
                      <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Measurement Criteria
                      </h5>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {explicitDetails.metric && (
                          <>
                            <dt className="text-muted-foreground">Metric:</dt>
                            <dd className="text-foreground">{explicitDetails.metric}</dd>
                          </>
                        )}
                        {explicitDetails.threshold && (
                          <>
                            <dt className="text-muted-foreground">Threshold:</dt>
                            <dd className="text-foreground font-mono">{explicitDetails.threshold}</dd>
                          </>
                        )}
                        {explicitDetails.dataSources && explicitDetails.dataSources.length > 0 && (
                          <>
                            <dt className="text-muted-foreground">Sources:</dt>
                            <dd className="text-foreground">
                              {explicitDetails.dataSources.join(', ')}
                            </dd>
                          </>
                        )}
                        {explicitDetails.monitoringFrequency && (
                          <>
                            <dt className="text-muted-foreground">Frequency:</dt>
                            <dd className="text-foreground">{explicitDetails.monitoringFrequency}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Judgment Details */}
                  {point.category === 'judgment' && judgmentDetails && (
                    <div className="bg-muted rounded-md p-3">
                      <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Judgment Criteria
                      </h5>
                      {judgmentDetails.observableProxies &&
                        judgmentDetails.observableProxies.length > 0 && (
                          <div className="mb-2">
                            <span className="text-xs text-muted-foreground">Observable Proxies:</span>
                            <ul className="mt-1 text-sm text-foreground list-disc list-inside">
                              {judgmentDetails.observableProxies.map((proxy, idx) => (
                                <li key={idx}>{proxy}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      {judgmentDetails.judgmentCriteria && (
                        <div className="mb-2">
                          <span className="text-xs text-muted-foreground">How to decide:</span>
                          <p className="mt-1 text-sm text-foreground">
                            {judgmentDetails.judgmentCriteria}
                          </p>
                        </div>
                      )}
                      {judgmentDetails.reviewFrequency && (
                        <div>
                          <span className="text-xs text-muted-foreground">Review:</span>
                          <span className="ml-1 text-sm text-foreground">
                            {judgmentDetails.reviewFrequency}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Response Protocol */}
                  {responseProtocol && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3 border border-blue-100 dark:border-blue-800">
                      <h5 className="text-xs font-medium text-blue-700 dark:text-blue-300 dark:text-blue-300 uppercase tracking-wide mb-2">
                        Response Protocol
                      </h5>
                      {responseProtocol.description && (
                        <p className="text-sm text-blue-900 dark:text-blue-100">{responseProtocol.description}</p>
                      )}
                      {responseProtocol.escalation && (
                        <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                          <span className="font-medium">Escalation:</span>{' '}
                          {responseProtocol.escalation.replace('_', ' ')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Dependent Thesis */}
                  {point.dependentThesisId && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-md p-3 border border-purple-100 dark:border-purple-800">
                      <h5 className="text-xs font-medium text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-1">
                        Dependent Thesis Trigger
                      </h5>
                      <p className="text-sm text-purple-900 dark:text-purple-100">
                        Triggers when {point.dependentThesisType} thesis{' '}
                        <span className="font-medium">{point.dependentThesisCondition}</span>
                        {point.dependentThesisConditionDetail && (
                          <span> ({point.dependentThesisConditionDetail})</span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {point.timeframe && (
                      <span>
                        <Clock className="w-3 h-3 inline mr-1" />
                        Timeframe: {point.timeframe.replace('_', ' ')}
                      </span>
                    )}
                    <span>
                      Created: {new Date(point.createdAt).toLocaleDateString('en-GB')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredPoints.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No points match the current filters.
        </div>
      )}
    </div>
  );
}
