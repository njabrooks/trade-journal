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
  const [filterType, setFilterType] = useState<'all' | 'confirmation' | 'warning'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'not_triggered' | 'monitoring' | 'triggered'>('all');

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
  const warningCount = validationPoints.filter((p) => p.type === 'warning').length;
  const triggeredCount = validationPoints.filter((p) => p.status === 'triggered').length;
  const monitoringCount = validationPoints.filter((p) => p.status === 'monitoring').length;

  const statusIcons: Record<string, React.ReactNode> = {
    not_triggered: <Clock className="w-4 h-4 text-slate-400" />,
    monitoring: <Eye className="w-4 h-4 text-blue-500" />,
    triggered: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    superseded: <XCircle className="w-4 h-4 text-slate-300" />,
  };

  const statusColors: Record<string, string> = {
    not_triggered: 'bg-slate-100 text-slate-600',
    monitoring: 'bg-blue-100 text-blue-700',
    triggered: 'bg-amber-100 text-amber-700',
    superseded: 'bg-slate-100 text-slate-400',
  };

  const importanceColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    significant: 'bg-amber-100 text-amber-700 border-amber-200',
    supporting: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  const categoryIcons: Record<string, React.ReactNode> = {
    data_driven: <Target className="w-3 h-3" />,
    judgment: <Scale className="w-3 h-3" />,
  };

  if (validationPoints.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <p className="text-sm text-slate-500">
          No validation points defined yet.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Use <code className="px-1 bg-slate-100 rounded">/synthesize-thesis</code> to create articulation with validation points.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            Validation Points
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3 h-3" />
              {confirmationCount} confirmation
            </span>
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              {warningCount} warning
            </span>
            {triggeredCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <AlertTriangle className="w-3 h-3" />
                {triggeredCount} triggered
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">Type:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="text-xs border-slate-200 rounded px-1.5 py-0.5"
            >
              <option value="all">All</option>
              <option value="confirmation">Confirmation</option>
              <option value="warning">Warning</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="text-xs border-slate-200 rounded px-1.5 py-0.5"
            >
              <option value="all">All ({validationPoints.length})</option>
              <option value="not_triggered">Not Triggered</option>
              <option value="monitoring">Monitoring ({monitoringCount})</option>
              <option value="triggered">Triggered ({triggeredCount})</option>
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
                  className="mt-0.5 text-slate-400 hover:text-slate-600"
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
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {point.type === 'confirmation' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {point.type === 'confirmation' ? 'Confirmation' : 'Warning'}
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
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-slate-600 bg-slate-100 rounded">
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
                  <p className="mt-1.5 text-sm text-slate-900">{point.statement}</p>

                  {/* Rationale (if not expanded) */}
                  {!isExpanded && point.rationale && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                      {point.rationale}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Convert to Data-Driven - only for judgment-based signals */}
                  {onConvertToExplicit && point.category === 'judgment' && point.status !== 'superseded' && (
                    <button
                      onClick={() => onConvertToExplicit(point)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded"
                      title="Convert to data-driven signal with measurable triggers"
                    >
                      <Zap className="w-3 h-3" />
                      Make Data-Driven
                    </button>
                  )}
                  {onUpdateStatus && point.status !== 'superseded' && (
                    <button
                      onClick={() => onUpdateStatus(point.id)}
                      className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded"
                    >
                      Update Status
                    </button>
                  )}
                  {onViewHistory && (
                    <button
                      onClick={() => onViewHistory(point.id)}
                      className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 rounded"
                    >
                      History
                    </button>
                  )}
                  <Link
                    href={`/${thesisType === 'macro' ? 'macro-theses' : 'asset-theses'}/${thesisId}/signals/${point.id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded"
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
                      <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        Rationale
                      </h5>
                      <p className="mt-1 text-sm text-slate-700">{point.rationale}</p>
                    </div>
                  )}

                  {/* Data-Driven Details */}
                  {point.category === 'data_driven' && explicitDetails && (
                    <div className="bg-slate-50 rounded-md p-3">
                      <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                        Measurement Criteria
                      </h5>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {explicitDetails.metric && (
                          <>
                            <dt className="text-slate-500">Metric:</dt>
                            <dd className="text-slate-900">{explicitDetails.metric}</dd>
                          </>
                        )}
                        {explicitDetails.threshold && (
                          <>
                            <dt className="text-slate-500">Threshold:</dt>
                            <dd className="text-slate-900 font-mono">{explicitDetails.threshold}</dd>
                          </>
                        )}
                        {explicitDetails.dataSources && explicitDetails.dataSources.length > 0 && (
                          <>
                            <dt className="text-slate-500">Sources:</dt>
                            <dd className="text-slate-900">
                              {explicitDetails.dataSources.join(', ')}
                            </dd>
                          </>
                        )}
                        {explicitDetails.monitoringFrequency && (
                          <>
                            <dt className="text-slate-500">Frequency:</dt>
                            <dd className="text-slate-900">{explicitDetails.monitoringFrequency}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Judgment Details */}
                  {point.category === 'judgment' && judgmentDetails && (
                    <div className="bg-slate-50 rounded-md p-3">
                      <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                        Judgment Criteria
                      </h5>
                      {judgmentDetails.observableProxies &&
                        judgmentDetails.observableProxies.length > 0 && (
                          <div className="mb-2">
                            <span className="text-xs text-slate-500">Observable Proxies:</span>
                            <ul className="mt-1 text-sm text-slate-700 list-disc list-inside">
                              {judgmentDetails.observableProxies.map((proxy, idx) => (
                                <li key={idx}>{proxy}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      {judgmentDetails.judgmentCriteria && (
                        <div className="mb-2">
                          <span className="text-xs text-slate-500">How to decide:</span>
                          <p className="mt-1 text-sm text-slate-700">
                            {judgmentDetails.judgmentCriteria}
                          </p>
                        </div>
                      )}
                      {judgmentDetails.reviewFrequency && (
                        <div>
                          <span className="text-xs text-slate-500">Review:</span>
                          <span className="ml-1 text-sm text-slate-700">
                            {judgmentDetails.reviewFrequency}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Response Protocol */}
                  {responseProtocol && (
                    <div className="bg-blue-50 rounded-md p-3 border border-blue-100">
                      <h5 className="text-xs font-medium text-blue-700 uppercase tracking-wide mb-2">
                        Response Protocol
                      </h5>
                      {responseProtocol.description && (
                        <p className="text-sm text-blue-900">{responseProtocol.description}</p>
                      )}
                      {responseProtocol.escalation && (
                        <p className="mt-1 text-xs text-blue-700">
                          <span className="font-medium">Escalation:</span>{' '}
                          {responseProtocol.escalation.replace('_', ' ')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Dependent Thesis */}
                  {point.dependentThesisId && (
                    <div className="bg-purple-50 rounded-md p-3 border border-purple-100">
                      <h5 className="text-xs font-medium text-purple-700 uppercase tracking-wide mb-1">
                        Dependent Thesis Trigger
                      </h5>
                      <p className="text-sm text-purple-900">
                        Triggers when {point.dependentThesisType} thesis{' '}
                        <span className="font-medium">{point.dependentThesisCondition}</span>
                        {point.dependentThesisConditionDetail && (
                          <span> ({point.dependentThesisConditionDetail})</span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Timeframe */}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>
                      <Clock className="w-3 h-3 inline mr-1" />
                      Timeframe: {point.timeframe.replace('_', ' ')}
                    </span>
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
        <div className="px-4 py-6 text-center text-sm text-slate-500">
          No points match the current filters.
        </div>
      )}
    </div>
  );
}
