'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ExternalLink,
  X,
  Play,
  Clock,
  FileText,
  Newspaper,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { UnifiedTriageRecord } from '@/types/triage';

// Import existing triage components for position/strategy
import { TriagePositionsTable } from './TriagePositionsTable';
import { TriageActionsTable } from './TriageActionsTable';
import { TriageActionButtons } from './TriageActionButtons';
import { ClaimsContext } from './ClaimsContext';

interface ExpandedTriageDetailProps {
  record: UnifiedTriageRecord;
  onDismiss: () => void;
  onActionComplete?: () => void;
}

export function ExpandedTriageDetail({ record, onDismiss, onActionComplete }: ExpandedTriageDetailProps) {
  // Render different content based on object type
  switch (record.objectType) {
    case 'position':
    case 'strategy':
      return (
        <PositionStrategyDetail
          record={record}
          onDismiss={onDismiss}
          onActionComplete={onActionComplete}
        />
      );
    case 'asset_thesis':
    case 'macro_thesis':
      return (
        <ThesisDetail
          record={record}
          onDismiss={onDismiss}
        />
      );
    default:
      return (
        <div className="text-slate-500">
          Unknown object type: {record.objectType}
        </div>
      );
  }
}

// =============================================================================
// Position/Strategy Expanded Detail
// Uses existing TriagePositionsTable, TriageActionsTable, and TriageActionButtons
// =============================================================================

function PositionStrategyDetail({
  record,
  onDismiss,
  onActionComplete,
}: {
  record: UnifiedTriageRecord;
  onDismiss: () => void;
  onActionComplete?: () => void;
}) {
  const positionRecord = record.positionTriageRecord;

  // State for position selection (matching TriageTableRow pattern)
  const [selectedPositionIds, setSelectedPositionIds] = useState<Set<string>>(new Set());
  const [positionQuantities, setPositionQuantities] = useState<Map<string, number>>(new Map());

  // Reset selections when record changes
  useEffect(() => {
    setSelectedPositionIds(new Set());
    setPositionQuantities(new Map());
  }, [record.id]);

  if (!positionRecord) {
    return (
      <div className="text-slate-500">
        No position/strategy data available.
      </div>
    );
  }

  const handleActionComplete = () => {
    setSelectedPositionIds(new Set());
    setPositionQuantities(new Map());
    onActionComplete?.();
  };

  return (
    <div className="space-y-4">
      {/* Evidence Context - Shows claims linked to this strategy's asset thesis */}
      {positionRecord.strategyId && (
        <ClaimsContext strategyId={positionRecord.strategyId} />
      )}

      {/* Positions Table with full functionality */}
      <TriagePositionsTable
        positionId={positionRecord.positionId}
        strategyId={positionRecord.strategyId}
        accountId={positionRecord.accountId}
        snapshotDate={positionRecord.snapshotDate}
        editMode={positionRecord.recommendedAction !== "QUANTITY_CHANGE"}
        selectedPositionIds={selectedPositionIds}
        onPositionSelect={async (positionId, selected) => {
          const newSelected = new Set(selectedPositionIds);
          if (selected) {
            newSelected.add(positionId);
            // Initialize quantity when selected (fetch current position quantity)
            if (!positionQuantities.has(positionId)) {
              try {
                let url = "";
                if (positionRecord.positionId) {
                  url = `/api/positions?positionId=${positionRecord.positionId}`;
                } else if (positionRecord.strategyId) {
                  url = `/api/positions?strategyId=${positionRecord.strategyId}`;
                }
                if (url) {
                  const response = await fetch(url);
                  if (response.ok) {
                    const data = await response.json();
                    const positionsList = Array.isArray(data) ? data : [data];
                    const position = positionsList.find((p: { id: string }) => p.id === positionId);
                    if (position) {
                      const newQuantities = new Map(positionQuantities);
                      newQuantities.set(positionId, parseFloat(position.quantity) || 0);
                      setPositionQuantities(newQuantities);
                    }
                  }
                }
              } catch (err) {
                console.error("Failed to fetch position quantity:", err);
              }
            }
          } else {
            newSelected.delete(positionId);
            // Remove quantity when deselected
            const newQuantities = new Map(positionQuantities);
            newQuantities.delete(positionId);
            setPositionQuantities(newQuantities);
          }
          setSelectedPositionIds(newSelected);
        }}
        onSelectAll={async () => {
          // Fetch positions to select all
          try {
            let url = "";
            if (positionRecord.positionId) {
              url = `/api/positions?positionId=${positionRecord.positionId}`;
            } else if (positionRecord.strategyId) {
              url = `/api/positions?strategyId=${positionRecord.strategyId}`;
            }
            if (url) {
              const response = await fetch(url);
              if (response.ok) {
                const data = await response.json();
                const positionsList = Array.isArray(data) ? data : [data];
                setSelectedPositionIds(new Set(positionsList.map((p: { id: string }) => p.id)));
                // Initialize quantities for all positions
                const newQuantities = new Map<string, number>();
                positionsList.forEach((p: { id: string; quantity: string }) => {
                  newQuantities.set(p.id, parseFloat(p.quantity) || 0);
                });
                setPositionQuantities(newQuantities);
              }
            }
          } catch (err) {
            console.error("Failed to fetch positions for select all:", err);
          }
        }}
        onDeselectAll={() => {
          setSelectedPositionIds(new Set());
          setPositionQuantities(new Map());
        }}
        positionQuantities={positionQuantities}
        onQuantityChange={(positionId, quantity) => {
          const newQuantities = new Map(positionQuantities);
          newQuantities.set(positionId, quantity);
          setPositionQuantities(newQuantities);
        }}
      />

      {/* Notes (only if not QUANTITY_CHANGE) */}
      {positionRecord.notes &&
       positionRecord.recommendedAction !== "QUANTITY_CHANGE" && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Notes
          </p>
          <div className="px-0">
            <p className="text-sm text-slate-700 leading-relaxed">{positionRecord.notes}</p>
          </div>
        </div>
      )}

      {/* Actions - show trade form when positions are selected, otherwise show action buttons */}
      {selectedPositionIds.size > 0 && positionRecord.recommendedAction !== "QUANTITY_CHANGE" ? (
        <TriageActionButtons
          triageId={positionRecord.id}
          contextLevel={positionRecord.contextLevel}
          recommendedAction={positionRecord.recommendedAction}
          strategyId={positionRecord.strategyId}
          positionId={positionRecord.positionId}
          severity={positionRecord.severity}
          initialAction="TRADE"
          onActionComplete={handleActionComplete}
          selectedPositionIds={selectedPositionIds}
          onPositionSelectionChange={setSelectedPositionIds}
          positionQuantities={positionQuantities}
        />
      ) : (
        <TriageActionsTable
          triageId={positionRecord.id}
          contextLevel={positionRecord.contextLevel}
          recommendedAction={positionRecord.recommendedAction}
          strategyId={positionRecord.strategyId}
          positionId={positionRecord.positionId}
          severity={positionRecord.severity}
          onActionComplete={handleActionComplete}
        />
      )}
    </div>
  );
}

// =============================================================================
// Thesis Expanded Detail (Macro or Asset)
// =============================================================================

function ThesisDetail({
  record,
  onDismiss,
}: {
  record: UnifiedTriageRecord;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    error?: string;
    output?: string;
  } | null>(null);

  const thesisRecord = record.thesisTriageRecord;
  const isMacro = record.objectType === 'macro_thesis';

  // Get suggested skill command
  const suggestedSkill = thesisRecord?.suggestedSkill;

  // Handler for executing synthesize-thesis skill
  async function handleRunSynthesizeThesis() {
    setIsExecuting(true);
    setExecutionResult(null);

    const thesisTitle = thesisRecord?.thesisTitle || record.title || 'thesis';

    // Use toast.promise for persistent notification that survives UI changes
    toast.promise(
      (async () => {
        const res = await fetch('/api/skills/synthesize-thesis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thesisId: record.objectId,
            thesisType: isMacro ? 'macro' : 'asset',
          }),
        });
        const data = await res.json();
        setExecutionResult(data);
        setIsExecuting(false);

        if (!data.success) {
          throw new Error(data.error || 'Skill execution failed');
        }

        // Refresh the triage list to show resolved record
        setTimeout(() => {
          router.refresh();
        }, 1500);

        return data;
      })(),
      {
        loading: `Synthesizing "${thesisTitle}"... This may take several minutes.`,
        success: `Articulation created for "${thesisTitle}"`,
        error: (err) => `Failed: ${err.message}`,
        duration: 10000, // Keep success/error visible for 10 seconds
      }
    );
  }

  // Construct the thesis URL
  const thesisUrl = isMacro
    ? `/macro-theses/${record.objectId}`
    : `/asset-theses/${record.objectId}`;

  // Parse JSONB fields
  const contentSummary = thesisRecord?.contentSummary as {
    totalArticles?: number;
    relevantArticles?: number;
    sources?: string[];
    searchQuery?: string;
    scanDate?: string;
  } | undefined;

  const aiAnalysis = thesisRecord?.aiAnalysis as {
    summary?: string;
    keyFindings?: string[];
    relevanceScore?: number;
    sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
    validationImpact?: string;
    recommendedAction?: string;
    suggestedNextSteps?: string[];
    validationPointsAffected?: Array<{
      pointId: string;
      pointStatement: string;
      evidenceType: 'strong_validation' | 'weak_validation' | 'neutral' | 'weak_invalidation' | 'strong_invalidation';
      confidence: 'high' | 'medium' | 'low';
      recommendedAction: string;
    }>;
  } | undefined;

  // Evidence type visual config
  const getEvidenceTypeConfig = (evidenceType: string) => {
    const config: Record<string, { icon: React.ReactNode; bgColor: string; textColor: string; label: string }> = {
      strong_validation: { icon: <TrendingUp className="h-4 w-4" />, bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', label: 'Strong Validation' },
      weak_validation: { icon: <TrendingUp className="h-4 w-4" />, bgColor: 'bg-green-50', textColor: 'text-green-600', label: 'Weak Validation' },
      neutral: { icon: <Minus className="h-4 w-4" />, bgColor: 'bg-slate-50', textColor: 'text-slate-600', label: 'Neutral' },
      weak_invalidation: { icon: <TrendingDown className="h-4 w-4" />, bgColor: 'bg-orange-50', textColor: 'text-orange-600', label: 'Weak Invalidation' },
      strong_invalidation: { icon: <TrendingDown className="h-4 w-4" />, bgColor: 'bg-red-50', textColor: 'text-red-700', label: 'Strong Invalidation' },
    };
    return config[evidenceType] || config.neutral;
  };

  const matchedResults = thesisRecord?.matchedResults as Array<{
    title?: string;
    source?: string;
    url?: string;
    snippet?: string;
    publishedDate?: string;
  }> | undefined;

  // Determine triage rule context
  const triageRule = thesisRecord?.triageRule;
  const isMonitoringContent = triageRule === 'thesis_monitoring_content';
  const isNeedsArticulation = triageRule === 'thesis_needs_articulation';
  const isNewClaimsAvailable = triageRule === 'thesis_new_claims_available';

  const copySkillToClipboard = () => {
    if (suggestedSkill) {
      navigator.clipboard.writeText(suggestedSkill);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Urgency Banner */}
      {thesisRecord?.urgency && thesisRecord.urgency !== 'when_convenient' && (
        <div className={`rounded-lg p-3 flex items-center gap-3 ${
          thesisRecord.urgency === 'immediate' ? 'bg-rose-50 border border-rose-200' :
          thesisRecord.urgency === 'today' ? 'bg-amber-50 border border-amber-200' :
          'bg-blue-50 border border-blue-200'
        }`}>
          <Clock className={`h-5 w-5 ${
            thesisRecord.urgency === 'immediate' ? 'text-rose-600' :
            thesisRecord.urgency === 'today' ? 'text-amber-600' :
            'text-blue-600'
          }`} />
          <div>
            <p className={`text-sm font-semibold ${
              thesisRecord.urgency === 'immediate' ? 'text-rose-800' :
              thesisRecord.urgency === 'today' ? 'text-amber-800' :
              'text-blue-800'
            }`}>
              {thesisRecord.urgency === 'immediate' ? 'Immediate Attention Required' :
               thesisRecord.urgency === 'today' ? 'Action Needed Today' :
               'Review This Week'}
            </p>
            {thesisRecord.actionRequired && (
              <p className={`text-xs mt-1 ${
                thesisRecord.urgency === 'immediate' ? 'text-rose-600' :
                thesisRecord.urgency === 'today' ? 'text-amber-600' :
                'text-blue-600'
              }`}>
                {thesisRecord.actionRequired}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Thesis Info Grid - Including Workflow Status and Evolution State */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoItem
          label="Thesis Type"
          value={isMacro ? 'Macro Thesis' : 'Asset Thesis'}
        />
        <InfoItem
          label="Lifecycle Stage"
          value={formatLifecycleStage(thesisRecord?.lifecycleStage)}
        />
        <InfoItem
          label="Trigger"
          value={formatTriageRule(triageRule)}
        />
        <InfoItem
          label="Trigger Source"
          value={thesisRecord?.triggerSource ?? 'N/A'}
        />
      </div>

      {/* Content Summary (for monitoring triggers) */}
      {isMonitoringContent && contentSummary && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-slate-600" />
            <p className="text-sm font-semibold text-slate-800">Content Summary</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {contentSummary.totalArticles !== undefined && (
              <div>
                <p className="text-slate-500">Articles Scanned</p>
                <p className="font-medium text-slate-900">{contentSummary.totalArticles}</p>
              </div>
            )}
            {contentSummary.relevantArticles !== undefined && (
              <div>
                <p className="text-slate-500">Relevant Found</p>
                <p className="font-medium text-slate-900">{contentSummary.relevantArticles}</p>
              </div>
            )}
            {contentSummary.sources && contentSummary.sources.length > 0 && (
              <div className="col-span-2">
                <p className="text-slate-500">Sources</p>
                <p className="font-medium text-slate-900">{contentSummary.sources.join(', ')}</p>
              </div>
            )}
          </div>

          {contentSummary.searchQuery && (
            <div className="text-xs">
              <p className="text-slate-500">Search Query</p>
              <p className="font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded mt-1">
                {contentSummary.searchQuery}
              </p>
            </div>
          )}
        </div>
      )}

      {/* AI Analysis */}
      {aiAnalysis && (aiAnalysis.summary || aiAnalysis.keyFindings) && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600" />
              <p className="text-sm font-semibold text-indigo-800">AI Analysis</p>
            </div>
            {aiAnalysis.relevanceScore !== undefined && (
              <Badge className={`${
                aiAnalysis.relevanceScore >= 0.7 ? 'bg-emerald-100 text-emerald-700' :
                aiAnalysis.relevanceScore >= 0.4 ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-slate-700'
              }`}>
                {Math.round(aiAnalysis.relevanceScore * 100)}% relevant
              </Badge>
            )}
          </div>

          {aiAnalysis.summary && (
            <p className="text-sm text-indigo-900">{aiAnalysis.summary}</p>
          )}

          {aiAnalysis.keyFindings && aiAnalysis.keyFindings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-indigo-700 mb-2">Key Findings:</p>
              <ul className="space-y-1">
                {aiAnalysis.keyFindings.slice(0, 5).map((finding, idx) => (
                  <li key={idx} className="text-xs text-indigo-800 flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Validation Points Affected - V&I Point Review */}
      {aiAnalysis?.validationPointsAffected && aiAnalysis.validationPointsAffected.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-slate-600" />
              <p className="text-sm font-semibold text-slate-700">Validation Points Affected</p>
              <Badge variant="outline" className="text-xs">
                {aiAnalysis.validationPointsAffected.length}
              </Badge>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {aiAnalysis.validationPointsAffected.map((vp, idx) => {
              const config = getEvidenceTypeConfig(vp.evidenceType);
              return (
                <div key={idx} className={`px-4 py-3 ${config.bgColor}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${config.textColor}`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${config.textColor}`}>
                        {vp.pointStatement}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={`text-xs ${config.bgColor} ${config.textColor} border border-current/20`}>
                          {config.label}
                        </Badge>
                        <span className={`text-xs ${config.textColor}`}>
                          {vp.confidence} confidence
                        </span>
                      </div>
                      {vp.recommendedAction && (
                        <p className="text-xs text-slate-600 mt-2 bg-white/50 px-2 py-1 rounded">
                          {vp.recommendedAction}
                        </p>
                      )}
                    </div>
                    {vp.pointId && (
                      <Link
                        href={`/${isMacro ? 'macro-theses' : 'asset-theses'}/${record.objectId}/signals/${vp.pointId}`}
                        className="text-blue-600 hover:text-blue-800 shrink-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Suggested Next Steps */}
      {aiAnalysis?.suggestedNextSteps && aiAnalysis.suggestedNextSteps.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">Suggested Next Steps</p>
          <ol className="text-sm text-amber-900 space-y-1 list-decimal list-inside">
            {aiAnalysis.suggestedNextSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Matched Headlines */}
      {matchedResults && matchedResults.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
            <p className="text-sm font-semibold text-slate-700">Key Headlines</p>
          </div>
          <div className="divide-y divide-slate-100">
            {matchedResults.slice(0, 5).map((result, idx) => (
              <div key={idx} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {result.title ?? 'Untitled'}
                    </p>
                    {result.snippet && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                        {result.snippet}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      {result.source && <span>{result.source}</span>}
                      {result.publishedDate && (
                        <>
                          <span>•</span>
                          <span>{result.publishedDate}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {result.url && (
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          {matchedResults.length > 5 && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-200">
              <p className="text-xs text-slate-500">
                +{matchedResults.length - 5} more results
              </p>
            </div>
          )}
        </div>
      )}

      {/* Lifecycle Triage Context */}
      {(isNeedsArticulation || isNewClaimsAvailable) && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-purple-600" />
            <p className="text-sm font-semibold text-purple-800">
              {isNeedsArticulation ? 'Articulation Required' : 'New Claims Available'}
            </p>
          </div>
          <p className="text-xs text-purple-700">
            {isNeedsArticulation
              ? 'This thesis has sufficient evidence but needs a formal articulation. Run the synthesis skill to generate validation/invalidation criteria.'
              : 'New claims have been linked since the last articulation. Consider regenerating the articulation to incorporate new evidence.'}
          </p>
        </div>
      )}

      {/* Suggested Skill */}
      {suggestedSkill && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-emerald-800">Suggested Action</p>
          </div>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-emerald-100 px-3 py-2 rounded text-sm font-mono text-emerald-900">
              {suggestedSkill}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copySkillToClipboard}
              className="gap-1 shrink-0"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-emerald-600 mt-2">
            Copy and paste this command in Claude Code to run the skill.
          </p>
        </div>
      )}

      {/* User Notes */}
      {thesisRecord?.userNotes && (
        <div className="bg-slate-100 rounded-lg p-3">
          <p className="text-sm font-medium text-slate-700">Notes</p>
          <p className="text-sm text-slate-600 mt-1">{thesisRecord.userNotes}</p>
        </div>
      )}

      {/* Execution Result Feedback */}
      {executionResult && (
        <div className={`rounded-lg p-3 flex items-start gap-3 ${
          executionResult.success
            ? 'bg-emerald-50 border border-emerald-200'
            : 'bg-rose-50 border border-rose-200'
        }`}>
          {executionResult.success ? (
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p className={`text-sm font-semibold ${
              executionResult.success ? 'text-emerald-800' : 'text-rose-800'
            }`}>
              {executionResult.success
                ? 'Thesis Articulation Created'
                : 'Execution Failed'}
            </p>
            <p className={`text-xs mt-1 ${
              executionResult.success ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              {executionResult.success
                ? 'The articulation and validation points have been saved. Page will refresh shortly.'
                : executionResult.error || 'An unknown error occurred.'}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t">
        <Link href={thesisUrl}>
          <Button variant="outline" size="sm" className="gap-1">
            <ExternalLink className="h-3 w-3" />
            View {isMacro ? 'Thesis' : 'Asset Thesis'}
          </Button>
        </Link>

        {/* Synthesize Thesis - Direct Execution */}
        {suggestedSkill === '/synthesize-thesis' && (
          <Button
            variant="default"
            size="sm"
            className="gap-1"
            onClick={handleRunSynthesizeThesis}
            disabled={isExecuting || executionResult?.success}
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Synthesizing...
              </>
            ) : executionResult?.success ? (
              <>
                <CheckCircle className="h-3 w-3" />
                Done
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                Synthesize Thesis
              </>
            )}
          </Button>
        )}

        {/* Other Skills - Copy to Clipboard */}
        {suggestedSkill && suggestedSkill !== '/synthesize-thesis' && (
          <Button
            variant="default"
            size="sm"
            className="gap-1"
            onClick={copySkillToClipboard}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied!' : 'Copy Skill'}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onDismiss}
          className="gap-1 text-slate-600"
        >
          <X className="h-3 w-3" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Helper Components and Functions
// =============================================================================

function InfoItem({
  label,
  value,
  valueClassName = '',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium text-slate-900 ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

function formatLifecycleStage(stage: string | null | undefined): string {
  if (!stage) return 'N/A';
  const stageLabels: Record<string, string> = {
    created: 'Created',
    claims_linked: 'Claims Linked',
    synthesized: 'Synthesized',
    validated: 'Validated',
    monitoring: 'Monitoring',
    closed: 'Closed',
    synthesis: 'Synthesis',
    developing: 'Developing',
    paused: 'Paused',
    invalidated: 'Invalidated',
    abandoned: 'Abandoned',
  };
  return stageLabels[stage] ?? stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTriageRule(rule: string | null | undefined): string {
  if (!rule) return 'N/A';
  // Action-oriented labels matching the trigger column
  const ruleLabels: Record<string, string> = {
    thesis_needs_articulation: 'Generate Articulation',
    thesis_new_claims_available: 'Review New Claims',
    thesis_monitoring_content: 'Assess Content',
    thesis_data_trigger: 'Review V&I Status',
    thesis_validation_triggered: 'Validation Triggered',
    thesis_manual_assessment: 'Manual Assessment',
  };
  return ruleLabels[rule] ?? rule.replace(/thesis_/g, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
