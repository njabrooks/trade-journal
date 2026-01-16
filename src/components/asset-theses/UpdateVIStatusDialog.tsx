'use client';

import { useState } from 'react';
import { X, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface ValidationPointAffected {
  pointId: string;
  pointStatement: string;
  evidenceType: string;
  confidence: string;
  recommendedAction: string;
}

interface MatchedResult {
  url: string;
  title: string;
  snippet: string;
}

interface UpdateVIStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  validationPointsAffected: ValidationPointAffected[];
  matchedResults: MatchedResult[];
  triageRecordId: string;
  onSuccess?: () => void;
}

interface PointUpdate {
  pointId: string;
  selected: boolean;
  newStatus: string;
  confidence: 'low' | 'medium' | 'high';
  notes: string;
}

// Map evidence type to recommended status (standardized #ENH-048)
function getRecommendedStatus(evidenceType: string): string {
  switch (evidenceType) {
    case 'strong_validation':
    case 'strong_invalidation':
      return 'complete';
    case 'weak_validation':
    case 'weak_invalidation':
      return 'active';
    default:
      return 'active';
  }
}

// Map confidence string to valid API value
function normalizeConfidence(confidence: string): 'low' | 'medium' | 'high' {
  const normalized = confidence.toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'medium';
}

export function UpdateVIStatusDialog({
  isOpen,
  onClose,
  validationPointsAffected,
  matchedResults,
  triageRecordId,
  onSuccess,
}: UpdateVIStatusDialogProps) {
  // Initialize point updates with pre-populated recommendations
  const [pointUpdates, setPointUpdates] = useState<PointUpdate[]>(() =>
    validationPointsAffected.map((vp) => ({
      pointId: vp.pointId,
      selected: true,
      newStatus: getRecommendedStatus(vp.evidenceType),
      confidence: normalizeConfidence(vp.confidence),
      notes: vp.recommendedAction || '',
    }))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);

  if (!isOpen) return null;

  const togglePointSelection = (pointId: string) => {
    setPointUpdates((prev) =>
      prev.map((p) =>
        p.pointId === pointId ? { ...p, selected: !p.selected } : p
      )
    );
  };

  const updatePointField = (
    pointId: string,
    field: keyof PointUpdate,
    value: string | boolean
  ) => {
    setPointUpdates((prev) =>
      prev.map((p) =>
        p.pointId === pointId ? { ...p, [field]: value } : p
      )
    );
  };

  const selectedCount = pointUpdates.filter((p) => p.selected).length;

  // Build evidence source from matched results
  const evidenceSource = matchedResults.length > 0
    ? `Monitoring: ${matchedResults[0].title}`
    : 'Triage Review';

  const evidenceLinks = matchedResults.slice(0, 3).map((r) => r.url).join(', ');

  const handleSubmit = async () => {
    const selectedPoints = pointUpdates.filter((p) => p.selected);
    if (selectedPoints.length === 0) {
      setError('Please select at least one validation point to update');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    let successfulUpdates = 0;

    try {
      for (const point of selectedPoints) {
        const vp = validationPointsAffected.find((v) => v.pointId === point.pointId);

        const response = await fetch(`/api/validation-points/${point.pointId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newStatus: point.newStatus,
            evidence: {
              source: evidenceSource,
              summary: point.notes || vp?.recommendedAction || 'Updated from triage review',
              link: evidenceLinks || undefined,
            },
            confidence: point.confidence,
            source: 'user',
            userActionTaken: `Updated via triage record ${triageRecordId}`,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          console.error(`Failed to update point ${point.pointId}:`, data.error);
        } else {
          successfulUpdates++;
        }
      }

      setSuccessCount(successfulUpdates);

      if (successfulUpdates === selectedPoints.length) {
        // All succeeded - close after brief delay
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1000);
      } else if (successfulUpdates > 0) {
        setError(`Updated ${successfulUpdates}/${selectedPoints.length} points. Some updates failed.`);
      } else {
        setError('Failed to update validation points');
      }
    } catch (err) {
      console.error('Error updating validation points:', err);
      setError('An error occurred while updating');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEvidenceTypeColor = (evidenceType: string) => {
    switch (evidenceType) {
      case 'strong_validation':
        return 'bg-emerald-100 text-emerald-700';
      case 'weak_validation':
        return 'bg-emerald-50 text-emerald-600';
      case 'strong_invalidation':
        return 'bg-red-100 text-red-700';
      case 'weak_invalidation':
        return 'bg-red-50 text-red-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Update V&I Status</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Review and confirm status changes for affected validation points
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {successCount > 0 && !error ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-lg font-medium text-slate-900">
                Updated {successCount} validation point{successCount !== 1 ? 's' : ''}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Error display */}
              {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Evidence source info */}
              <div className="px-4 py-3 bg-slate-50 rounded-lg">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Evidence Source
                </p>
                <p className="text-sm text-slate-700">{evidenceSource}</p>
                {evidenceLinks && (
                  <p className="text-xs text-slate-500 mt-1 truncate">{evidenceLinks}</p>
                )}
              </div>

              {/* Validation points list */}
              <div className="space-y-3">
                {validationPointsAffected.map((vp, idx) => {
                  const update = pointUpdates.find((p) => p.pointId === vp.pointId);
                  if (!update) return null;

                  return (
                    <div
                      key={vp.pointId}
                      className={`border rounded-lg transition-colors ${
                        update.selected
                          ? 'border-blue-200 bg-blue-50/30'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      {/* Point header */}
                      <div className="px-4 py-3 flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={update.selected}
                          onChange={() => togglePointSelection(vp.pointId)}
                          className="mt-1 w-4 h-4 rounded border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-900">
                              {vp.pointStatement}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 text-xs rounded ${getEvidenceTypeColor(
                                vp.evidenceType
                              )}`}
                            >
                              {vp.evidenceType.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            AI Recommendation: {vp.recommendedAction}
                          </p>
                        </div>
                      </div>

                      {/* Point update fields (shown when selected) */}
                      {update.selected && (
                        <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3 ml-7">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">New Status</Label>
                              <select
                                value={update.newStatus}
                                onChange={(e) =>
                                  updatePointField(vp.pointId, 'newStatus', e.target.value)
                                }
                                className="w-full mt-1 px-2 py-1.5 text-sm border border-slate-300 rounded-md"
                              >
                                <option value="draft">Draft</option>
                                <option value="active">Active</option>
                                <option value="complete">Complete</option>
                                <option value="rejected">Rejected</option>
                              </select>
                            </div>
                            <div>
                              <Label className="text-xs">Confidence</Label>
                              <select
                                value={update.confidence}
                                onChange={(e) =>
                                  updatePointField(vp.pointId, 'confidence', e.target.value)
                                }
                                className="w-full mt-1 px-2 py-1.5 text-sm border border-slate-300 rounded-md"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Notes / Evidence Summary</Label>
                            <Textarea
                              value={update.notes}
                              onChange={(e) =>
                                updatePointField(vp.pointId, 'notes', e.target.value)
                              }
                              placeholder="Summarize why this status change is appropriate"
                              rows={2}
                              className="mt-1 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {successCount === 0 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <p className="text-sm text-slate-600">
              {selectedCount} point{selectedCount !== 1 ? 's' : ''} selected
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || selectedCount === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  `Update ${selectedCount} Point${selectedCount !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
