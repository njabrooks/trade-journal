'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { EntityBadge } from '@/components/ui/entity-badge';
import { Check, X, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ClaimSuggestion } from '@/db/queries/research';

export interface SuggestionActionResult {
  claimId: string;
  suggestionId: string;
  action: 'accepted' | 'rejected';
  // Only present for 'accepted':
  newLink?: {
    thesisId?: string | null;
    thesisTitle?: string | null;
    assetThesisId?: string | null;
    assetThesisTitle?: string | null;
    ticker?: string | null;
    mappingType: string;
  };
  claimStatus?: string;
}

interface InlineClaimSuggestionsProps {
  suggestions: ClaimSuggestion[];
  compact?: boolean; // true = table cell view, false = expanded detail view
  onSuggestionActioned?: (result: SuggestionActionResult) => void;
  /** B5: suppress suggestions for monitoring-phase theses (evidence routes to signals instead) */
  suppressSuggestions?: boolean;
}

export function InlineClaimSuggestions({
  suggestions,
  compact = true,
  onSuggestionActioned,
  suppressSuggestions = false,
}: InlineClaimSuggestionsProps) {
  const router = useRouter();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());

  // B5: When thesis is in monitoring phase, suppress claim-to-thesis suggestions
  if (suppressSuggestions) {
    return null;
  }

  const visibleSuggestions = suggestions.filter(
    (s) => !dismissedIds.has(s.id) && !acceptedIds.has(s.id)
  );

  if (visibleSuggestions.length === 0) {
    return <span className="text-xs text-muted-foreground">Not linked</span>;
  }

  const handleAccept = async (suggestion: ClaimSuggestion) => {
    setProcessingId(suggestion.id);
    try {
      const response = await fetch(
        `/api/research/claims/suggestions/${suggestion.id}/accept`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );
      if (!response.ok) throw new Error('Failed to accept');
      const data = await response.json();
      setAcceptedIds((prev) => new Set([...prev, suggestion.id]));
      if (onSuggestionActioned) {
        onSuggestionActioned({
          claimId: suggestion.claimId,
          suggestionId: suggestion.id,
          action: 'accepted',
          newLink: {
            thesisId: suggestion.thesisId,
            thesisTitle: suggestion.thesisTitle,
            assetThesisId: suggestion.assetThesisId,
            assetThesisTitle: suggestion.assetThesisTitle,
            ticker: suggestion.ticker,
            mappingType: data.mappingType || suggestion.mappingType || 'supports',
          },
          claimStatus: data.claimStatus,
        });
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to accept suggestion:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (suggestion: ClaimSuggestion) => {
    setProcessingId(suggestion.id);
    try {
      const response = await fetch(
        `/api/research/claims/suggestions/${suggestion.id}/reject`,
        { method: 'POST' }
      );
      if (!response.ok) throw new Error('Failed to reject');
      setDismissedIds((prev) => new Set([...prev, suggestion.id]));
      if (onSuggestionActioned) {
        onSuggestionActioned({
          claimId: suggestion.claimId,
          suggestionId: suggestion.id,
          action: 'rejected',
        });
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to reject suggestion:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const getRelationshipBadge = (mappingType: string | null) => {
    switch (mappingType) {
      case 'supports':
        return { className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800', label: '↑' };
      case 'refutes':
        return { className: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800', label: '↓' };
      case 'foundation':
        return { className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800', label: '★' };
      default:
        return { className: 'bg-slate-50 text-foreground border', label: '?' };
    }
  };

  const getFullRelationshipBadge = (mappingType: string | null) => {
    switch (mappingType) {
      case 'supports':
        return { className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800', label: 'Supports' };
      case 'refutes':
        return { className: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800', label: 'Refutes' };
      case 'foundation':
        return { className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800', label: 'Foundation' };
      default:
        return { className: 'bg-slate-50 text-foreground border', label: mappingType || '?' };
    }
  };

  // Compact view for table cells
  if (compact) {
    return (
      <div className="space-y-1">
        {visibleSuggestions.map((suggestion) => {
          const badge = getRelationshipBadge(suggestion.mappingType);
          const title = suggestion.thesisTitle || suggestion.assetThesisTitle || 'Unknown';
          const confidence = Math.round(Number(suggestion.confidenceScore || 0) * 100);
          const isProcessing = processingId === suggestion.id;

          return (
            <div
              key={suggestion.id}
              className="flex items-center gap-1 group"
              title={`${suggestion.reasoning}\n\nConfidence: ${confidence}%`}
            >
              <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
              <Badge className={`${badge.className} text-xs px-1`}>
                {badge.label}
              </Badge>
              <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={title}>
                {title}
              </span>
              <span className="text-xs text-muted-foreground/60">{confidence}%</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleAccept(suggestion); }}
                disabled={isProcessing}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 disabled:opacity-50 shrink-0"
                title="Accept suggestion"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleReject(suggestion); }}
                disabled={isProcessing}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 disabled:opacity-50 shrink-0"
                title="Reject suggestion"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  // Expanded view for detail sections
  return (
    <div className="space-y-2">
      {visibleSuggestions.map((suggestion) => {
        const badge = getFullRelationshipBadge(suggestion.mappingType);
        const title = suggestion.thesisTitle || suggestion.assetThesisTitle || 'Unknown';
        const confidence = Math.round(Number(suggestion.confidenceScore || 0) * 100);
        const isProcessing = processingId === suggestion.id;
        const isMacro = !!suggestion.thesisId;

        return (
          <div
            key={suggestion.id}
            className="flex items-start gap-2 p-2 rounded-md bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30"
          >
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <EntityBadge
                  entityType={isMacro ? 'macro_thesis' : 'asset_thesis'}
                  id={(isMacro ? suggestion.thesisId : suggestion.assetThesisId) || ''}
                  title={title}
                  size="sm"
                />
                <Badge className={`${badge.className} text-xs`}>
                  {badge.label}
                </Badge>
                {suggestion.ticker && (
                  <span className="text-xs text-muted-foreground">({suggestion.ticker})</span>
                )}
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs ml-auto shrink-0">
                  {confidence}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {suggestion.reasoning}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); handleAccept(suggestion); }}
                disabled={isProcessing}
                className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 disabled:opacity-50 transition-colors"
                title="Accept suggestion"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleReject(suggestion); }}
                disabled={isProcessing}
                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 disabled:opacity-50 transition-colors"
                title="Reject suggestion"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
