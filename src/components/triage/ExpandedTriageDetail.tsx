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
  Sparkles,
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
import { ThesisClaimsBrowserWrapper } from './ThesisClaimsBrowserWrapper';
import { ThesisSignalTriageCard } from './ThesisSignalTriageCard';
import { UnifiedSignalsTable } from '@/components/signals/UnifiedSignalsTable';
import type { Signal } from '@/db/schema';

// Helper to check if this is a trade metadata capture trigger (QUANTITY_CHANGE or TRADE_INGESTION)
function isTradeMetadataTrigger(recommendedAction: string | null): boolean {
  return recommendedAction === "QUANTITY_CHANGE" || recommendedAction === "TRADE_INGESTION";
}

interface ExpandedTriageDetailProps {
  record: UnifiedTriageRecord;
  onDismiss: () => void;
  onActionComplete?: () => void;
  initialAction?: string; // Auto-start this action when expanded (e.g., 'TRADE')
}

export function ExpandedTriageDetail({ record, onDismiss, onActionComplete, initialAction }: ExpandedTriageDetailProps) {
  // Render different content based on object type
  switch (record.objectType) {
    case 'position':
    case 'strategy':
      return (
        <PositionStrategyDetail
          record={record}
          onDismiss={onDismiss}
          onActionComplete={onActionComplete}
          initialAction={initialAction}
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
        <div className="text-muted-foreground">
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
  initialAction,
}: {
  record: UnifiedTriageRecord;
  onDismiss: () => void;
  onActionComplete?: () => void;
  initialAction?: string;
}) {
  const positionRecord = record.positionTriageRecord;

  // State for position selection (matching TriageTableRow pattern)
  const [selectedPositionIds, setSelectedPositionIds] = useState<Set<string>>(new Set());
  const [positionQuantities, setPositionQuantities] = useState<Map<string, number>>(new Map());
  // State for auto-starting trade action
  const [autoStartTrade, setAutoStartTrade] = useState(initialAction === 'TRADE');

  // Reset selections when record changes
  useEffect(() => {
    setSelectedPositionIds(new Set());
    setPositionQuantities(new Map());
    setAutoStartTrade(initialAction === 'TRADE');
  }, [record.id, initialAction]);

  if (!positionRecord) {
    return (
      <div className="text-muted-foreground">
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
        editMode={!isTradeMetadataTrigger(positionRecord.recommendedAction)}
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

      {/* Notes (only if not a trade metadata trigger) */}
      {positionRecord.notes &&
       !isTradeMetadataTrigger(positionRecord.recommendedAction) && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Notes
          </p>
          <div className="px-0">
            <p className="text-sm text-foreground leading-relaxed">{positionRecord.notes}</p>
          </div>
        </div>
      )}

      {/* Actions - show trade form when:
          1. Positions are selected (for non-trade-metadata triggers)
          2. autoStartTrade is true (e.g., user clicked Trade button in quick actions)
          Otherwise show action selection buttons */}
      {(selectedPositionIds.size > 0 && !isTradeMetadataTrigger(positionRecord.recommendedAction)) ||
       (autoStartTrade && isTradeMetadataTrigger(positionRecord.recommendedAction)) ? (
        <TriageActionButtons
          triageId={positionRecord.id}
          contextLevel={positionRecord.contextLevel}
          recommendedAction={positionRecord.recommendedAction}
          strategyId={positionRecord.strategyId}
          positionId={positionRecord.positionId}
          severity={positionRecord.severity}
          initialAction="TRADE"
          onActionComplete={() => {
            setAutoStartTrade(false);
            handleActionComplete();
          }}
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
  // Track current linked claim count from ThesisClaimsBrowserWrapper
  const [currentLinkedClaimCount, setCurrentLinkedClaimCount] = useState<number | null>(null);

  const thesisRecord = record.thesisTriageRecord;
  const isMacro = record.objectType === 'macro_thesis';

  // Get suggested skill command
  const suggestedSkill = thesisRecord?.suggestedSkill;

  // Handler for executing build-core-argument skill
  async function handleRunSynthesizeThesis() {
    setIsExecuting(true);
    setExecutionResult(null);

    const thesisTitle = thesisRecord?.thesisTitle || record.title || 'thesis';

    // Use toast.promise for persistent notification that survives UI changes
    toast.promise(
      (async () => {
        const res = await fetch('/api/skills/build-core-argument', {
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
        loading: `Building core argument for "${thesisTitle}"... This may take several minutes.`,
        success: `Core argument created for "${thesisTitle}"`,
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
      strong_validation: { icon: <TrendingUp className="h-4 w-4" />, bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-600 dark:text-emerald-400', label: 'Strong Validation' },
      weak_validation: { icon: <TrendingUp className="h-4 w-4" />, bgColor: 'bg-green-500/10', textColor: 'text-green-600 dark:text-green-400', label: 'Weak Validation' },
      neutral: { icon: <Minus className="h-4 w-4" />, bgColor: 'bg-muted/50', textColor: 'text-muted-foreground', label: 'Neutral' },
      weak_invalidation: { icon: <TrendingDown className="h-4 w-4" />, bgColor: 'bg-orange-500/10', textColor: 'text-orange-600 dark:text-orange-400', label: 'Weak Invalidation' },
      strong_invalidation: { icon: <TrendingDown className="h-4 w-4" />, bgColor: 'bg-red-500/10', textColor: 'text-red-600 dark:text-red-400', label: 'Strong Invalidation' },
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
  const isMonitoringContent = triageRule === 'thesis_monitoring_content' || triageRule === 'REVIEW_CONTENT';
  const isNeedsArticulation = triageRule === 'thesis_needs_articulation' || triageRule === 'NEEDS_RESEARCH' || triageRule === 'PRODUCE_CORE_ARGUMENT';
  const isNewClaimsAvailable = triageRule === 'thesis_new_claims_available' || triageRule === 'UPDATE_CORE_ARGUMENT';
  const isSignalTriggered = triageRule === 'SIGNAL_TRIGGERED';
  const isReviewRecommendedSignals = triageRule === 'REVIEW_RECOMMENDED_SIGNALS' || triageRule === 'REVIEW_DRAFT_SIGNALS';

  // Synthesis triggers show simplified UI: just claims browser + confirmation button
  const isSynthesisTrigger = triageRule === 'PRODUCE_CORE_ARGUMENT' || triageRule === 'thesis_needs_articulation' ||
    triageRule === 'UPDATE_CORE_ARGUMENT' || triageRule === 'thesis_new_claims_available';

  // Parse signal-specific content summary
  const signalContentSummary = isSignalTriggered ? (thesisRecord?.contentSummary as {
    triggeredSignalCount?: number;
    totalSignalCount?: number;
    triggeredSignalIds?: string[];
    currentConviction?: 'high' | 'medium' | 'low';
  } | undefined) : undefined;

  // Parse synthesis-specific content summary for claim counts
  const synthesisContentSummary = isSynthesisTrigger ? (thesisRecord?.contentSummary as {
    currentClaimCount?: number;
    claimsAtLastArticulation?: number;
    newClaimCount?: number;
    hasArticulation?: boolean;
  } | undefined) : undefined;

  // Calculate dynamic new claim count (uses live data from claims browser, not stored snapshot)
  const claimsAtLastArticulation = synthesisContentSummary?.claimsAtLastArticulation ?? 0;
  const dynamicNewClaimCount = currentLinkedClaimCount !== null
    ? Math.max(0, currentLinkedClaimCount - claimsAtLastArticulation)
    : synthesisContentSummary?.newClaimCount ?? 0; // Fallback to stored value while loading

  const copySkillToClipboard = () => {
    if (suggestedSkill) {
      navigator.clipboard.writeText(suggestedSkill);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Severity Banner - hidden for synthesis triggers */}
      {!isSynthesisTrigger && record.status === 'urgent' && (
        <div className="rounded-lg p-3 flex items-center gap-3 bg-destructive/10 border border-destructive/20">
          <Clock className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">
              Urgent Attention Required
            </p>
            {thesisRecord?.actionRequired && (
              <p className="text-xs mt-1 text-muted-foreground">
                {thesisRecord.actionRequired}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Thesis Info Grid - hidden for synthesis triggers */}
      {!isSynthesisTrigger && (
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
      )}

      {/* Content Summary (for monitoring triggers) */}
      {isMonitoringContent && contentSummary && (
        <div className="bg-muted/50 border border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Content Summary</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {contentSummary.totalArticles !== undefined && (
              <div>
                <p className="text-muted-foreground">Articles Scanned</p>
                <p className="font-medium text-foreground">{contentSummary.totalArticles}</p>
              </div>
            )}
            {contentSummary.relevantArticles !== undefined && (
              <div>
                <p className="text-muted-foreground">Relevant Found</p>
                <p className="font-medium text-foreground">{contentSummary.relevantArticles}</p>
              </div>
            )}
            {contentSummary.sources && contentSummary.sources.length > 0 && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Sources</p>
                <p className="font-medium text-foreground">{contentSummary.sources.join(', ')}</p>
              </div>
            )}
          </div>

          {contentSummary.searchQuery && (
            <div className="text-xs">
              <p className="text-muted-foreground">Search Query</p>
              <p className="font-mono text-foreground bg-muted px-2 py-1 rounded mt-1">
                {contentSummary.searchQuery}
              </p>
            </div>
          )}
        </div>
      )}

      {/* AI Analysis */}
      {aiAnalysis && (aiAnalysis.summary || aiAnalysis.keyFindings) && (
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600" />
              <p className="text-sm font-semibold text-foreground">AI Analysis</p>
            </div>
            {aiAnalysis.relevanceScore !== undefined && (
              <Badge className={`${
                aiAnalysis.relevanceScore >= 0.7 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                aiAnalysis.relevanceScore >= 0.4 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                'bg-muted text-muted-foreground'
              }`}>
                {Math.round(aiAnalysis.relevanceScore * 100)}% relevant
              </Badge>
            )}
          </div>

          {aiAnalysis.summary && (
            <p className="text-sm text-foreground">{aiAnalysis.summary}</p>
          )}

          {aiAnalysis.keyFindings && aiAnalysis.keyFindings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Key Findings:</p>
              <ul className="space-y-1">
                {aiAnalysis.keyFindings.slice(0, 5).map((finding, idx) => (
                  <li key={idx} className="text-xs text-foreground flex items-start gap-2">
                    <span className="text-muted-foreground mt-0.5">•</span>
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
        <div className="bg-card border border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/50 border-b border">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Validation Points Affected</p>
              <Badge variant="outline" className="text-xs">
                {aiAnalysis.validationPointsAffected.length}
              </Badge>
            </div>
          </div>
          <div className="divide-y divide-border">
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
                        <p className="text-xs text-muted-foreground mt-2 bg-card/50 px-2 py-1 rounded">
                          {vp.recommendedAction}
                        </p>
                      )}
                    </div>
                    {vp.pointId && (
                      <Link
                        href={`/signals/${vp.pointId}`}
                        className="text-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0"
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
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <p className="text-sm font-semibold text-foreground mb-2">Suggested Next Steps</p>
          <ol className="text-sm text-foreground space-y-1 list-decimal list-inside">
            {aiAnalysis.suggestedNextSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Matched Headlines */}
      {matchedResults && matchedResults.length > 0 && (
        <div className="bg-card border border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/50 border-b border">
            <p className="text-sm font-semibold text-foreground">Key Headlines</p>
          </div>
          <div className="divide-y divide-border">
            {matchedResults.slice(0, 5).map((result, idx) => (
              <div key={idx} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {result.title ?? 'Untitled'}
                    </p>
                    {result.snippet && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {result.snippet}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
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
                      className="text-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          {matchedResults.length > 5 && (
            <div className="px-4 py-2 bg-muted/50 border-t border">
              <p className="text-xs text-muted-foreground">
                +{matchedResults.length - 5} more results
              </p>
            </div>
          )}
        </div>
      )}

      {/* Lifecycle Triage Context - hidden for synthesis triggers (shown in simplified view instead) */}
      {!isSynthesisTrigger && (isNeedsArticulation || isNewClaimsAvailable) && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-purple-600" />
            <p className="text-sm font-semibold text-foreground">
              {isNeedsArticulation ? 'Core Argument Required' : 'New Claims Available'}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {isNeedsArticulation
              ? 'This thesis has sufficient evidence but needs a core argument. Run the skill to generate confirmation/warning signals.'
              : 'New claims have been linked since the last core argument. Consider rebuilding to incorporate new evidence.'}
          </p>
        </div>
      )}

      {/* Claims Browser for NEEDS_RESEARCH - shows existing claims or research prompt */}
      {triageRule === 'NEEDS_RESEARCH' && (
        <ThesisClaimsBrowserWrapper
          thesisId={record.objectId}
          thesisType={isMacro ? 'macro' : 'asset'}
        />
      )}

      {/* Simplified Synthesis View - confirmation button above claims browser */}
      {isSynthesisTrigger && (
        <>
          {/* Synthesis Action Card - above claims for visibility */}
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {isNewClaimsAvailable
                    ? 'New evidence available — update core argument'
                    : 'Ready to build core argument'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isNewClaimsAvailable
                    ? `${dynamicNewClaimCount} new claims since last core argument. Review the claims below, then update.`
                    : `${currentLinkedClaimCount ?? synthesisContentSummary?.currentClaimCount ?? 0} claims linked. Review the claims below, then build core argument and signals.`}
                </p>
              </div>
              <Button
                onClick={handleRunSynthesizeThesis}
                disabled={isExecuting || executionResult?.success}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isNewClaimsAvailable ? 'Updating...' : 'Building...'}
                  </>
                ) : executionResult?.success ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Done
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {isNewClaimsAvailable
                      ? `Update Core Argument (+${dynamicNewClaimCount} claims)`
                      : 'Build Core Argument'}
                  </>
                )}
              </Button>
            </div>
          </div>
          {/* Claims Browser - below action for review */}
          <ThesisClaimsBrowserWrapper
            thesisId={record.objectId}
            thesisType={isMacro ? 'macro' : 'asset'}
            onClaimsLoaded={setCurrentLinkedClaimCount}
          />
        </>
      )}

      {/* Signal Triggered - Thesis-Level Assessment */}
      {isSignalTriggered && signalContentSummary && (
        <ThesisSignalTriageCard
          thesisId={record.objectId}
          thesisType={isMacro ? 'macro' : 'asset'}
          thesisTitle={thesisRecord?.thesisTitle || record.title || 'Thesis'}
          triggeredSignalCount={signalContentSummary.triggeredSignalCount ?? 0}
          totalSignalCount={signalContentSummary.totalSignalCount ?? 0}
          triggeredSignalIds={signalContentSummary.triggeredSignalIds ?? []}
          currentConviction={signalContentSummary.currentConviction}
          onActionComplete={() => {
            // Refresh the page to show updated triage
            router.refresh();
            onDismiss();
          }}
        />
      )}

      {/* Review Recommended Signals - Batch Review UI */}
      {isReviewRecommendedSignals && (
        <RecommendedSignalsReview
          thesisId={record.objectId}
          thesisType={isMacro ? 'macro' : 'asset'}
          thesisTitle={thesisRecord?.thesisTitle || record.title}
          onComplete={() => {
            // Refresh the page to show resolved triage
            router.refresh();
            onDismiss();
          }}
        />
      )}

      {/* Suggested Skill - hidden for synthesis triggers (integrated into simplified view) */}
      {!isSynthesisTrigger && suggestedSkill && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground">Suggested Action</p>
          </div>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-emerald-500/15 px-3 py-2 rounded text-sm font-mono text-emerald-600 dark:text-emerald-400">
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
          <p className="text-xs text-muted-foreground mt-2">
            Copy and paste this command in Claude Code to run the skill.
          </p>
        </div>
      )}

      {/* User Notes */}
      {thesisRecord?.userNotes && (
        <div className="bg-muted rounded-lg p-3">
          <p className="text-sm font-medium text-foreground">Notes</p>
          <p className="text-sm text-muted-foreground mt-1">{thesisRecord.userNotes}</p>
        </div>
      )}

      {/* Execution Result Feedback */}
      {executionResult && (
        <div className={`rounded-lg p-3 flex items-start gap-3 ${
          executionResult.success
            ? 'bg-emerald-500/10 border border-emerald-500/20'
            : 'bg-destructive/10 border border-destructive/20'
        }`}>
          {executionResult.success ? (
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          )}
          <div>
            <p className={`text-sm font-semibold ${
              executionResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
            }`}>
              {executionResult.success
                ? 'Core Argument Created'
                : 'Execution Failed'}
            </p>
            <p className={`text-xs mt-1 ${
              executionResult.success ? 'text-muted-foreground' : 'text-muted-foreground'
            }`}>
              {executionResult.success
                ? 'The core argument and signals have been saved. Page will refresh shortly.'
                : executionResult.error || 'An unknown error occurred.'}
            </p>
          </div>
        </div>
      )}

      {/* Actions - hidden for synthesis triggers (integrated into simplified view) */}
      {!isSynthesisTrigger && (
        <div className="flex items-center gap-2 pt-2 border-t">
          <Link href={thesisUrl}>
            <Button variant="outline" size="sm" className="gap-1">
              <ExternalLink className="h-3 w-3" />
              View {isMacro ? 'Thesis' : 'Asset Thesis'}
            </Button>
          </Link>

          {/* Build Core Argument - Direct Execution */}
          {suggestedSkill === '/build-core-argument' && (
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
                  Building...
                </>
              ) : executionResult?.success ? (
                <>
                  <CheckCircle className="h-3 w-3" />
                  Done
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Build Core Argument
                </>
              )}
            </Button>
          )}

          {/* Other Skills - Copy to Clipboard */}
          {suggestedSkill && suggestedSkill !== '/build-core-argument' && (
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
            className="gap-1 text-muted-foreground"
          >
            <X className="h-3 w-3" />
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Recommended Signals Review (Wrapper for UnifiedSignalsTable in review mode)
// =============================================================================

function RecommendedSignalsReview({
  thesisId,
  thesisType,
  thesisTitle,
  onComplete,
}: {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle?: string;
  onComplete?: () => void;
}) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSignals() {
      try {
        // Fetch signals with status='draft' - these are AI-proposed signals needing user review
        const response = await fetch(`/api/validation-points?thesisId=${thesisId}&thesisType=${thesisType}&status=draft`);
        if (!response.ok) {
          throw new Error('Failed to fetch signals');
        }
        const data = await response.json();
        setSignals(data.validationPoints || []);
      } catch (err) {
        console.error('Error fetching signals:', err);
        setError(err instanceof Error ? err.message : 'Failed to load signals');
      } finally {
        setIsLoading(false);
      }
    }

    fetchSignals();
  }, [thesisId, thesisType]);

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
        <AlertCircle className="h-5 w-5 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <UnifiedSignalsTable
      signals={signals}
      thesisId={thesisId}
      thesisType={thesisType}
      thesisTitle={thesisTitle}
      mode="review"
      onComplete={onComplete}
      isLoading={isLoading}
    />
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
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium text-foreground ${valueClassName}`}>
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
    thesis_needs_articulation: 'Build Core Argument',
    thesis_new_claims_available: 'Review New Claims',
    thesis_monitoring_content: 'Assess Content',
    thesis_data_trigger: 'Review V&I Status',
    thesis_validation_triggered: 'Validation Triggered',
    thesis_manual_assessment: 'Manual Assessment',
    // New thesis triage rules
    NEEDS_RESEARCH: 'Needs Research',
    PRODUCE_CORE_ARGUMENT: 'Build Core Argument',
    UPDATE_CORE_ARGUMENT: 'Review New Claims',
    REVIEW_CONTENT: 'Assess Content',
    REVIEW_RECOMMENDED_SIGNALS: 'Review Signals',
    SIGNAL_TRIGGERED: 'Assess Signal Impact',
  };
  return ruleLabels[rule] ?? rule.replace(/thesis_/g, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
