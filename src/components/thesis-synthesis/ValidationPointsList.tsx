'use client';

import { useState } from 'react';
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
  Play,
  Edit,
  Power,
  PowerOff,
  Calendar,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ValidationPoint, MonitoringSpec, MonitoringEvent } from '@/db/schema';

interface ValidationPointsListProps {
  validationPoints: ValidationPoint[];
  onUpdateStatus?: (pointId: string) => void;
  onViewHistory?: (pointId: string) => void;
  // Monitoring props
  monitoringSpecs?: Array<{
    spec: MonitoringSpec & { lastCheckEvent?: MonitoringEvent | null };
    validationPoint: ValidationPoint;
  }>;
  onCreateSpec?: (validationPointId: string) => void;
  onEditSpec?: (specId: string) => void;
  onRunCheck?: (specId: string) => void;
  onToggleEnabled?: (specId: string, enabled: boolean) => void;
}

export function ValidationPointsList({
  validationPoints,
  onUpdateStatus,
  onViewHistory,
  monitoringSpecs = [],
  onCreateSpec,
  onEditSpec,
  onRunCheck,
  onToggleEnabled,
}: ValidationPointsListProps) {
  const [expandedPoints, setExpandedPoints] = useState<Set<string>>(new Set());
  const [expandedMonitoring, setExpandedMonitoring] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'validation' | 'invalidation'>('all');
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

  const toggleMonitoring = (id: string) => {
    const next = new Set(expandedMonitoring);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedMonitoring(next);
  };

  // Group specs by validation point
  const specsByPoint = new Map<string, typeof monitoringSpecs>();
  for (const item of monitoringSpecs) {
    const pointId = item.validationPoint.id;
    if (!specsByPoint.has(pointId)) {
      specsByPoint.set(pointId, []);
    }
    specsByPoint.get(pointId)!.push(item);
  }

  const formatLastChecked = (date: Date | null | undefined) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const formatNextCheck = (date: Date | null | undefined) => {
    if (!date) return 'On demand';
    const dateObj = new Date(date);
    return dateObj.toLocaleDateString();
  };

  const getDataSourceIcon = (source: string) => {
    switch (source) {
      case 'fred':
        return '📊';
      case 'news':
        return '📰';
      case 'price_iv':
        return '📈';
      case 'sec_filings':
        return '📄';
      default:
        return '🔍';
    }
  };

  const filteredPoints = validationPoints.filter((point) => {
    if (filterType !== 'all' && point.type !== filterType) return false;
    if (filterStatus !== 'all' && point.status !== filterStatus) return false;
    return true;
  });

  const validationCount = validationPoints.filter((p) => p.type === 'validation').length;
  const invalidationCount = validationPoints.filter((p) => p.type === 'invalidation').length;
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
    explicit: <Target className="w-3 h-3" />,
    judgment_required: <Scale className="w-3 h-3" />,
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
              {validationCount} validation
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="w-3 h-3" />
              {invalidationCount} invalidation
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
              <option value="validation">Validation</option>
              <option value="invalidation">Invalidation</option>
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
                        point.type === 'validation'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {point.type === 'validation' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {point.type}
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
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-3 ml-7 space-y-3">
                  {/* Monitoring Section */}
                  {(() => {
                    const pointSpecs = specsByPoint.get(point.id) || [];
                    const hasSpecs = pointSpecs.length > 0;
                    const isMonitoringExpanded = expandedMonitoring.has(point.id);

                    return (
                      <div className="bg-blue-50 rounded-lg border border-blue-100 overflow-hidden">
                        <div
                          className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-blue-100/50"
                          onClick={() => hasSpecs && toggleMonitoring(point.id)}
                        >
                          <div className="flex items-center gap-2">
                            {hasSpecs && (
                              <>
                                {isMonitoringExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-blue-600" />
                                )}
                              </>
                            )}
                            <h5 className="text-xs font-medium text-blue-700 uppercase tracking-wide">
                              Monitoring
                            </h5>
                            {hasSpecs ? (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                                {pointSpecs.length} spec{pointSpecs.length > 1 ? 's' : ''}
                              </Badge>
                            ) : (
                              <span className="text-xs text-blue-600">Not monitored</span>
                            )}
                          </div>
                          {onCreateSpec && !hasSpecs && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCreateSpec(point.id);
                              }}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Create Spec
                            </Button>
                          )}
                        </div>

                        {/* Monitoring Specs (Expanded) */}
                        {isMonitoringExpanded && hasSpecs && (
                          <div className="px-3 pb-3 space-y-2">
                            {pointSpecs.map(({ spec }) => (
                              <div
                                key={spec.id}
                                className={`p-2 rounded border ${
                                  spec.enabled
                                    ? 'border-blue-200 bg-white'
                                    : 'border-slate-200 bg-slate-50/50'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    {/* Keywords */}
                                    <div className="flex flex-wrap items-center gap-1 mb-1.5">
                                      {(spec.keywords as string[]).map((keyword) => (
                                        <Badge
                                          key={keyword}
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          {keyword}
                                        </Badge>
                                      ))}
                                    </div>

                                    {/* Data Sources */}
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      {(spec.sources as string[]).map((source) => (
                                        <span
                                          key={source}
                                          title={source}
                                          className="text-base"
                                        >
                                          {getDataSourceIcon(source)}
                                        </span>
                                      ))}
                                    </div>

                                    {/* Metadata */}
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                      <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        <span>{spec.frequency}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>Last: {formatLastChecked(spec.lastCheckEvent?.checkedAt)}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span>Next: {formatNextCheck(spec.nextCheck)}</span>
                                      </div>
                                      {!spec.enabled && (
                                        <Badge variant="outline" className="text-xs">
                                          Disabled
                                        </Badge>
                                      )}
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center gap-1">
                                    {onRunCheck && (
                                      <Button
                                        size="sm"
                                        onClick={() => onRunCheck(spec.id)}
                                        disabled={!spec.enabled}
                                        title="Run check now"
                                      >
                                        <Play className="w-3 h-3 mr-1" />
                                        Run
                                      </Button>
                                    )}
                                    {onEditSpec && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onEditSpec(spec.id)}
                                        title="Edit spec"
                                      >
                                        <Edit className="w-3 h-3" />
                                      </Button>
                                    )}
                                    {onToggleEnabled && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => onToggleEnabled(spec.id, !spec.enabled)}
                                        title={spec.enabled ? 'Disable' : 'Enable'}
                                      >
                                        {spec.enabled ? (
                                          <Power className="w-3 h-3 text-green-600" />
                                        ) : (
                                          <PowerOff className="w-3 h-3 text-slate-400" />
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Create Spec CTA (when expanded but no specs) */}
                        {isMonitoringExpanded && !hasSpecs && onCreateSpec && (
                          <div className="px-3 pb-3">
                            <div className="text-center py-3 text-sm text-blue-600">
                              <p className="mb-2">No monitoring specs configured for this validation point.</p>
                              <Button
                                size="sm"
                                onClick={() => onCreateSpec(point.id)}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Create First Spec
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Rationale */}
                  {point.rationale && (
                    <div>
                      <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        Rationale
                      </h5>
                      <p className="mt-1 text-sm text-slate-700">{point.rationale}</p>
                    </div>
                  )}

                  {/* Explicit Details */}
                  {point.category === 'explicit' && explicitDetails && (
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
                  {point.category === 'judgment_required' && judgmentDetails && (
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
                      Created: {new Date(point.createdAt).toLocaleDateString()}
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
