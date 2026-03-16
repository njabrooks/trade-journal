'use client';

import { useState, useEffect, useCallback } from 'react';
import { UnifiedClaimsBrowser } from './UnifiedClaimsBrowser';
import type { SuggestionActionResult } from './InlineClaimSuggestions';
import { Loader2 } from 'lucide-react';

interface ArtifactClaimsBrowserProps {
  artifactId: string;
}

export function ArtifactClaimsBrowser({ artifactId }: ArtifactClaimsBrowserProps) {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClaims() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/research/artifacts/${artifactId}/claims`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch claims');
        }

        const data = await response.json();
        setClaims(data.claims);
      } catch (err) {
        console.error('Error fetching claims:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch claims');
      } finally {
        setLoading(false);
      }
    }

    fetchClaims();
  }, [artifactId]);

  const handleSuggestionActioned = useCallback((result: SuggestionActionResult) => {
    setClaims((prev) =>
      prev.map((claimWithSource) => {
        if (claimWithSource.claim.id !== result.claimId) return claimWithSource;

        // Remove the actioned suggestion
        const updatedSuggestions = (claimWithSource.suggestions || []).filter(
          (s: any) => s.id !== result.suggestionId
        );

        if (result.action === 'accepted' && result.newLink) {
          // Update claim status (draft → active)
          const updatedClaim = {
            ...claimWithSource.claim,
            ...(result.claimStatus ? { status: result.claimStatus } : {}),
          };

          // Add the new linkage to the appropriate array
          const link = result.newLink;
          const updatedTheses = [...(claimWithSource.linkedTheses || [])];
          const updatedViews = [...(claimWithSource.linkedViews || [])];

          if (link.thesisId) {
            updatedTheses.push({
              id: link.thesisId,
              title: link.thesisTitle || 'Unknown',
              mappingType: link.mappingType,
            });
          } else if (link.assetThesisId) {
            updatedViews.push({
              id: link.assetThesisId,
              title: link.assetThesisTitle || 'Unknown',
              ticker: link.ticker || '',
              mappingType: link.mappingType,
            });
          }

          return {
            ...claimWithSource,
            claim: updatedClaim,
            suggestions: updatedSuggestions,
            linkedTheses: updatedTheses,
            linkedViews: updatedViews,
          };
        }

        // Rejected: just remove the suggestion
        return {
          ...claimWithSource,
          suggestions: updatedSuggestions,
        };
      })
    );
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        <span className="ml-2 text-sm text-slate-500">Loading claims...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-slate-500">
        No claims found for this research artifact.
      </div>
    );
  }

  return (
    <UnifiedClaimsBrowser
      claimsWithSources={claims}
      filterArtifactId={artifactId}
      onSuggestionActioned={handleSuggestionActioned}
    />
  );
}
