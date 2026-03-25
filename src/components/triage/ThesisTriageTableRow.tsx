'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  CheckCircle,
  ExternalLink,
  Lightbulb,
  Target,
  ArrowRight,
  Edit3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UpdateVIStatusDialog } from '@/components/asset-theses/UpdateVIStatusDialog';
import { formatDateShort } from '@/lib/formatters';
import { cn } from '@/lib/utils';

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

export interface ThesisTriageRecord {
  id: string;
  createdAt: string;
  thesisId: string;
  thesisType: string;
  thesisTitle: string;
  displayTitle: string;
  direction: string | null;
  triggerType: string;
  triggerSource: string;
  triageRule: string;
  severity: string;
  status: string;
  lifecycleStage: string | null;
  suggestedSkill: string | null;
  actionRequired: string | null;
  userNotes: string | null;
  aiAnalysis: AiAnalysis | null;
  matchedResults: MatchedResult[] | null;
}

interface ThesisTriageTableRowProps {
  record: ThesisTriageRecord;
  onActionComplete?: () => void;
}

function SeverityTag({ severity }: { severity: string }) {
  const classNameMap: Record<string, string> = {
    urgent: 'bg-destructive/15 text-destructive border-destructive/20',
    attention: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20',
    monitor: 'bg-muted text-muted-foreground border-border',
    info: 'bg-muted text-muted-foreground border-border',
    critical: 'bg-destructive/15 text-destructive border-destructive/20',
    high: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20',
    medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
    low: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium', classNameMap[severity] ?? classNameMap.info)}
    >
      {severity}
    </Badge>
  );
}

function getEvidenceTypeColor(evidenceType: string) {
  switch (evidenceType) {
    case 'strong_validation':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    case 'weak_validation':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    case 'strong_invalidation':
      return 'bg-destructive/15 text-destructive';
    case 'weak_invalidation':
      return 'bg-destructive/15 text-destructive';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function ThesisTriageTableRow({ record, onActionComplete }: ThesisTriageTableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [updateVIRecord, setUpdateVIRecord] = useState<ThesisTriageRecord | null>(null);

  const handleAction = async (action: 'done' | 'dismissed', notes?: string) => {
    setActioningId(record.id);
    try {
      const updateData = {
        status: 'done' as const,
        severity: action === 'dismissed' ? 'info' : undefined,
        userNotes: notes,
        completedBy: 'user',
      };
      const response = await fetch(`/api/thesis-triage/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        throw new Error('Failed to update triage record');
      }
      onActionComplete?.();
    } catch (err) {
      console.error('Error updating triage:', err);
    } finally {
      setActioningId(null);
    }
  };

  const handleVIUpdateSuccess = async () => {
    if (updateVIRecord) {
      await handleAction('done', 'V&I status updated from triage review');
    }
    setUpdateVIRecord(null);
  };

  const getRuleDisplayName = (rule: string) => {
    switch (rule) {
      case 'REVIEW_CONTENT':
        return 'New Monitoring Results';
      case 'UPDATE_CORE_ARGUMENT':
        return 'New Claims Available';
      case 'NEEDS_ARTICULATION':
        return 'Needs Articulation';
      default:
        return rule;
    }
  };

  const thesisPath = record.thesisType === 'macro' ? '/macro-theses' : '/asset-theses';

  return (
    <>
      <tr
        className={cn(
          'border-b transition-colors hover:bg-muted cursor-pointer',
          isExpanded && 'bg-muted'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="px-4 py-3 text-left">
          <div className="flex items-center gap-2">
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform shrink-0',
                isExpanded && 'rotate-180'
              )}
            />
            <Link
              href={`${thesisPath}/${record.thesisId}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
            >
              {record.displayTitle}
            </Link>
            {record.direction && (
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded',
                  record.direction === 'bullish'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-destructive/15 text-destructive'
                )}
              >
                {record.direction}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-left">
          <span className="text-sm text-muted-foreground">{getRuleDisplayName(record.triageRule)}</span>
        </td>
        <td className="px-4 py-3 text-center">
          <SeverityTag severity={record.severity} />
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-xs text-muted-foreground capitalize">
            {record.thesisType}
          </span>
        </td>
        <td className="px-4 py-3 text-center text-xs text-muted-foreground">
          {formatDateShort(record.createdAt)}
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={5} className="px-4 py-4 bg-muted">
            <div className="space-y-4">
              {/* AI Analysis Summary */}
              {record.aiAnalysis?.summary && (
                <div>
                  <p className="text-sm leading-relaxed text-foreground">{record.aiAnalysis.summary}</p>
                </div>
              )}

              {/* Key Findings */}
              {record.aiAnalysis?.keyFindings && record.aiAnalysis.keyFindings.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5" />
                    Key Findings
                  </h4>
                  <ul className="space-y-1.5">
                    {record.aiAnalysis.keyFindings.map((finding, i) => (
                      <li key={i} className="text-sm flex items-start gap-2 text-foreground">
                        <span className="w-1 h-1 rounded-full bg-slate-400 mt-2 flex-shrink-0" />
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Validation Points Affected */}
              {record.aiAnalysis?.validationPointsAffected &&
                record.aiAnalysis.validationPointsAffected.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5" />
                      Validation Points Affected
                    </h4>
                    <div className="space-y-2">
                      {record.aiAnalysis.validationPointsAffected.map((vp, i) => (
                        <div key={i} className="bg-card rounded-md p-2.5 text-sm border">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-foreground">{vp.pointStatement}</p>
                            <span
                              className={cn(
                                'px-1.5 py-0.5 text-xs rounded flex-shrink-0',
                                getEvidenceTypeColor(vp.evidenceType)
                              )}
                            >
                              {vp.evidenceType.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs mt-1 text-muted-foreground">
                            <span className="font-medium">Action:</span> {vp.recommendedAction}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Suggested Next Steps */}
              {record.aiAnalysis?.suggestedNextSteps &&
                record.aiAnalysis.suggestedNextSteps.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <ArrowRight className="w-3.5 h-3.5" />
                      Suggested Next Steps
                    </h4>
                    <ul className="space-y-1">
                      {record.aiAnalysis.suggestedNextSteps.map((step, i) => (
                        <li key={i} className="text-sm flex items-start gap-2 text-foreground">
                          <span className="text-xs font-mono text-muted-foreground">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* Matched Articles */}
              {record.matchedResults && record.matchedResults.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Source Articles ({record.matchedResults.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {record.matchedResults.slice(0, 5).map((result, i) => (
                      <a
                        key={i}
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="block bg-card rounded-md p-2 border hover:border-slate-300 transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <ExternalLink className="w-3.5 h-3.5 mt-0.5 text-muted-foreground group-hover:text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400">
                              {result.title}
                            </p>
                            {result.snippet && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {result.snippet.slice(0, 150)}...
                              </p>
                            )}
                          </div>
                        </div>
                      </a>
                    ))}
                    {record.matchedResults.length > 5 && (
                      <p className="text-xs text-center text-muted-foreground">
                        +{record.matchedResults.length - 5} more articles
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Action Required (for non-REVIEW_CONTENT records) */}
              {record.actionRequired && record.triageRule !== 'REVIEW_CONTENT' && (
                <div className="bg-card rounded-md p-3 border">
                  <p className="text-sm text-foreground">{record.actionRequired}</p>
                  {record.suggestedSkill && (
                    <p className="text-xs mt-2 font-mono bg-muted px-2 py-1 rounded inline-block text-muted-foreground">
                      {record.suggestedSkill}
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                {record.aiAnalysis?.validationPointsAffected &&
                  record.aiAnalysis.validationPointsAffected.length > 0 && (
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      disabled={actioningId === record.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setUpdateVIRecord(record);
                      }}
                    >
                      <Edit3 className="w-4 h-4 mr-1.5" />
                      Update V&I Status
                    </Button>
                  )}
                <Button
                  size="sm"
                  variant="outline"
                  className={
                    record.aiAnalysis?.validationPointsAffected?.length ? '' : 'flex-1'
                  }
                  disabled={actioningId === record.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction('done', 'Reviewed and acknowledged');
                  }}
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
                  className="text-muted-foreground"
                  disabled={actioningId === record.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction('dismissed', 'Dismissed by user');
                  }}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}

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
    </>
  );
}
