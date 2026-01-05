'use client';

import { useState } from 'react';
import { Play, Edit, Power, PowerOff, ChevronDown, ChevronRight, Clock, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ValidationPoint, MonitoringSpec, MonitoringEvent } from '@/db/schema';

interface MonitoringSpecsListProps {
  validationPoints: ValidationPoint[];
  specs: Array<{
    spec: MonitoringSpec & { lastCheckEvent?: MonitoringEvent | null };
    validationPoint: ValidationPoint;
  }>;
  onRunCheck: (specId: string) => void;
  onEditSpec: (specId: string) => void;
  onToggleEnabled: (specId: string, enabled: boolean) => void;
  onCreateSpec: (validationPointId: string) => void;
}

export function MonitoringSpecsList({
  validationPoints,
  specs,
  onRunCheck,
  onEditSpec,
  onToggleEnabled,
  onCreateSpec,
}: MonitoringSpecsListProps) {
  const [expandedPoints, setExpandedPoints] = useState<Set<string>>(new Set());

  const togglePoint = (id: string) => {
    const next = new Set(expandedPoints);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedPoints(next);
  };

  // Group specs by validation point
  const specsByPoint = new Map<string, typeof specs>();
  for (const item of specs) {
    const pointId = item.validationPoint.id;
    if (!specsByPoint.has(pointId)) {
      specsByPoint.set(pointId, []);
    }
    specsByPoint.get(pointId)!.push(item);
  }

  // Filter to only points with specs or all points
  const pointsToShow = validationPoints;

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

  if (pointsToShow.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <p className="text-sm text-slate-500">No validation points available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-base font-semibold text-slate-900">Monitoring Specs</h3>
        <p className="text-xs text-slate-500 mt-1">
          Configure and manage monitoring for validation points
        </p>
      </div>

      {/* List */}
      <div className="divide-y divide-slate-100">
        {pointsToShow.map((point) => {
          const pointSpecs = specsByPoint.get(point.id) || [];
          const hasSpecs = pointSpecs.length > 0;
          const isExpanded = expandedPoints.has(point.id);

          return (
            <div key={point.id} className="p-4">
              {/* Validation Point Header */}
              <div
                className="flex items-start justify-between cursor-pointer group"
                onClick={() => hasSpecs && togglePoint(point.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {hasSpecs && (
                      <button className="text-slate-400 group-hover:text-slate-600">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <h4 className="text-sm font-medium text-slate-900">{point.statement}</h4>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-6">
                    <Badge variant="outline" className="text-xs">
                      {point.type === 'validation' ? 'Validation' : 'Invalidation'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {point.importance}
                    </Badge>
                    {hasSpecs ? (
                      <span className="text-xs text-green-600 font-medium">
                        ✓ Monitored ({pointSpecs.length} spec{pointSpecs.length > 1 ? 's' : ''})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Not monitored</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  {!hasSpecs && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateSpec(point.id);
                      }}
                    >
                      Create Spec
                    </Button>
                  )}
                </div>
              </div>

              {/* Specs (Expanded) */}
              {isExpanded && hasSpecs && (
                <div className="mt-4 ml-6 space-y-3">
                  {pointSpecs.map(({ spec }) => (
                    <div
                      key={spec.id}
                      className={`p-3 rounded-lg border ${
                        spec.enabled ? 'border-slate-200 bg-slate-50' : 'border-slate-100 bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          {/* Keywords */}
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {(spec.keywords as string[]).map((keyword) => (
                              <Badge key={keyword} variant="secondary" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>

                          {/* Data Sources */}
                          <div className="flex items-center gap-2 mb-2">
                            {(spec.sources as string[]).map((source) => (
                              <span key={source} title={source} className="text-lg">
                                {getDataSourceIcon(source)}
                              </span>
                            ))}
                          </div>

                          {/* Metadata */}
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>{spec.frequency}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>
                                Last: {formatLastChecked(spec.lastCheckEvent?.checkedAt)}
                              </span>
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
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            size="sm"
                            onClick={() => onRunCheck(spec.id)}
                            disabled={!spec.enabled}
                            title="Run check now"
                          >
                            <Play className="w-3 h-3 mr-1" />
                            Run
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEditSpec(spec.id)}
                            title="Edit spec"
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
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
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
