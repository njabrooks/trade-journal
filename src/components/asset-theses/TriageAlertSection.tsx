'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Target,
  ArrowRight,
  Edit3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UpdateVIStatusDialog } from '@/components/asset-theses/UpdateVIStatusDialog';

interface ValidationPointAffected {
  pointId: string;
  pointStatement: string;
  evidenceType: string;
  confidence: string;
  recommendedAction: string;
}

interface AiAnalysis {
  summary: string;
  keyFindings: string[];
  suggestedNextSteps: string[];
  validationPointsAffected: ValidationPointAffected[];
}

interface MatchedResult {
  url: string;
  title: string;
  snippet: string;
  date: string;
  queryType: string;
  matchScore: number;
  matchedKeywords: string[];
}

interface TriageRecord {
  id: string;
  createdAt: string;
  thesisId: string;
  thesisType: string;
  thesisTitle: string;
  triggerType: string;
  triggerSource: string;
  triageRule: string;
  severity: string;
  urgency: string;
  status: string;
  lifecycleStage: string | null;
  suggestedSkill: string | null;
  actionRequired: string | null;
  userNotes: string | null;
  aiAnalysis: AiAnalysis | null;
  matchedResults: MatchedResult[] | null;
}

interface TriageAlertSectionProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
}

export function TriageAlertSection({ thesisId, thesisType }: TriageAlertSectionProps) {
  const [records, setRecords] = useState<TriageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [updateVIRecord, setUpdateVIRecord] = useState<TriageRecord | null>(null);

  useEffect(() => {
    async function fetchTriage() {
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
          (r: TriageRecord) => r.status !== 'done'
        );
        setRecords(activeRecords);
        // Auto-expand the first REVIEW_CONTENT record if any
        const reviewContent = activeRecords.find((r: TriageRecord) => r.triageRule === 'REVIEW_CONTENT');
        if (reviewContent) {
          setExpandedRecord(reviewContent.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
    fetchTriage();
  }, [thesisId]);

  const handleAction = async (recordId: string, action: 'done' | 'dismissed', notes?: string) => {
    setActioningId(recordId);
    try {
      // Map action to new status/severity pattern
      // 'done' = completed successfully, 'dismissed' = completed but dismissed (severity = info)
      const updateData = {
        status: 'done' as const,
        severity: action === 'dismissed' ? 'info' : undefined,
        userNotes: notes,
        completedBy: 'user',
      };
      const response = await fetch(`/api/thesis-triage/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        throw new Error('Failed to update triage record');
      }
      // Remove from list
      setRecords(records.filter(r => r.id !== recordId));
    } catch (err) {
      console.error('Error updating triage:', err);
    } finally {
      setActioningId(null);
    }
  };

  const handleVIUpdateSuccess = async () => {
    // After V&I status update, mark triage as actioned
    if (updateVIRecord) {
      await handleAction(updateVIRecord.id, 'done', 'V&I status updated from triage review');
    }
    setUpdateVIRecord(null);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'high':
        return 'bg-orange-50 border-orange-200 text-orange-800';
      case 'medium':
        return 'bg-amber-50 border-amber-200 text-amber-800';
      case 'low':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'info':
        return 'bg-slate-50 border-slate-200 text-slate-700';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-700';
      case 'high':
        return 'bg-orange-100 text-orange-700';
      case 'medium':
        return 'bg-amber-100 text-amber-700';
      case 'low':
        return 'bg-blue-100 text-blue-700';
      case 'info':
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-600';
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="py-4 text-center">
        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-slate-200 border-t-slate-600"></div>
        <p className="mt-2 text-sm text-slate-500">Loading triage alerts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center text-sm text-red-600">{error}</div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="py-6 text-center">
        <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
        <p className="text-sm text-slate-600 font-medium">No pending alerts</p>
        <p className="text-xs text-slate-400 mt-1">All triage items have been addressed</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <div
          key={record.id}
          className={`rounded-lg border ${getSeverityColor(record.severity)} overflow-hidden`}
        >
          {/* Header - always visible */}
          <button
            onClick={() => setExpandedRecord(expandedRecord === record.id ? null : record.id)}
            className="w-full px-4 py-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {record.triageRule === 'REVIEW_CONTENT' ? 'New Monitoring Results' :
                     record.triageRule === 'UPDATE_CORE_ARGUMENT' ? 'New Claims Available' :
                     record.triageRule}
                  </span>
                  <span className={`px-1.5 py-0.5 text-xs rounded ${getSeverityBadgeColor(record.severity)}`}>
                    {record.severity}
                  </span>
                </div>
                <p className="text-xs opacity-75 mt-0.5">
                  {formatDate(record.createdAt)} • {record.urgency.replace('_', ' ')}
                </p>
              </div>
            </div>
            {expandedRecord === record.id ? (
              <ChevronUp className="w-4 h-4 opacity-50" />
            ) : (
              <ChevronDown className="w-4 h-4 opacity-50" />
            )}
          </button>

          {/* Expanded content */}
          {expandedRecord === record.id && (
            <div className="px-4 pb-4 space-y-4 border-t border-current/10">
              {/* AI Analysis Summary */}
              {record.aiAnalysis?.summary && (
                <div className="pt-3">
                  <p className="text-sm leading-relaxed">{record.aiAnalysis.summary}</p>
                </div>
              )}

              {/* Key Findings */}
              {record.aiAnalysis?.keyFindings && record.aiAnalysis.keyFindings.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2 flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5" />
                    Key Findings
                  </h4>
                  <ul className="space-y-1.5">
                    {record.aiAnalysis.keyFindings.map((finding, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-current mt-2 flex-shrink-0" />
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Validation Points Affected */}
              {record.aiAnalysis?.validationPointsAffected && record.aiAnalysis.validationPointsAffected.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" />
                    Validation Points Affected
                  </h4>
                  <div className="space-y-2">
                    {record.aiAnalysis.validationPointsAffected.map((vp, i) => (
                      <div key={i} className="bg-white/50 rounded-md p-2.5 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium">{vp.pointStatement}</p>
                          <span className={`px-1.5 py-0.5 text-xs rounded flex-shrink-0 ${getEvidenceTypeColor(vp.evidenceType)}`}>
                            {vp.evidenceType.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs mt-1 opacity-75">
                          <span className="font-medium">Action:</span> {vp.recommendedAction}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Next Steps */}
              {record.aiAnalysis?.suggestedNextSteps && record.aiAnalysis.suggestedNextSteps.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2 flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5" />
                    Suggested Next Steps
                  </h4>
                  <ul className="space-y-1">
                    {record.aiAnalysis.suggestedNextSteps.map((step, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-xs font-mono opacity-50">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Matched Articles */}
              {record.matchedResults && record.matchedResults.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2">
                    Source Articles ({record.matchedResults.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {record.matchedResults.slice(0, 5).map((result, i) => (
                      <a
                        key={i}
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block bg-white/50 rounded-md p-2 hover:bg-white/80 transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <ExternalLink className="w-3.5 h-3.5 mt-0.5 opacity-40 group-hover:opacity-70 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate group-hover:text-blue-600">
                              {result.title}
                            </p>
                            {result.snippet && (
                              <p className="text-xs opacity-60 line-clamp-2 mt-0.5">
                                {result.snippet.slice(0, 150)}...
                              </p>
                            )}
                          </div>
                        </div>
                      </a>
                    ))}
                    {record.matchedResults.length > 5 && (
                      <p className="text-xs text-center opacity-50">
                        +{record.matchedResults.length - 5} more articles
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Action Required (for non-REVIEW_CONTENT records) */}
              {record.actionRequired && record.triageRule !== 'REVIEW_CONTENT' && (
                <div className="bg-white/50 rounded-md p-3">
                  <p className="text-sm">{record.actionRequired}</p>
                  {record.suggestedSkill && (
                    <p className="text-xs mt-2 font-mono bg-white/50 px-2 py-1 rounded inline-block">
                      {record.suggestedSkill}
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-current/10">
                {/* Update V&I Status button - shown when there are validation points affected */}
                {record.aiAnalysis?.validationPointsAffected &&
                 record.aiAnalysis.validationPointsAffected.length > 0 && (
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1"
                    disabled={actioningId === record.id}
                    onClick={() => setUpdateVIRecord(record)}
                  >
                    <Edit3 className="w-4 h-4 mr-1.5" />
                    Update V&I Status
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className={record.aiAnalysis?.validationPointsAffected?.length ? '' : 'flex-1'}
                  disabled={actioningId === record.id}
                  onClick={() => handleAction(record.id, 'done', 'Reviewed and acknowledged')}
                >
                  {actioningId === record.id ? (
                    <span className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-1.5" />
                      Confirm Read
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-slate-500"
                  disabled={actioningId === record.id}
                  onClick={() => handleAction(record.id, 'dismissed', 'Dismissed by user')}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Update V&I Status Dialog */}
      {updateVIRecord && updateVIRecord.aiAnalysis?.validationPointsAffected && (
        <UpdateVIStatusDialog
          isOpen={true}
          onClose={() => setUpdateVIRecord(null)}
          validationPointsAffected={updateVIRecord.aiAnalysis.validationPointsAffected}
          matchedResults={updateVIRecord.matchedResults || []}
          triageRecordId={updateVIRecord.id}
          onSuccess={handleVIUpdateSuccess}
        />
      )}
    </div>
  );
}
