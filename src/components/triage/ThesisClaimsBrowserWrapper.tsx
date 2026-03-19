'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, SearchIcon, ExternalLinkIcon } from 'lucide-react';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ThesisClaimsBrowserWrapperProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  className?: string;
  /** Called when claims finish loading, provides the count of linked claims */
  onClaimsLoaded?: (linkedCount: number) => void;
}

interface LinkedThesis {
  id: string;
  title: string;
  mappingType: string;
}

interface LinkedView {
  id: string;
  title: string;
  ticker: string;
  mappingType: string;
}

interface ClaimWithSource {
  claim: any;
  insight: any;
  artifact: any;
  linkedTheses?: LinkedThesis[];
  linkedViews?: LinkedView[];
}

export function ThesisClaimsBrowserWrapper({
  thesisId,
  thesisType,
  className,
  onClaimsLoaded,
}: ThesisClaimsBrowserWrapperProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimsWithSources, setClaimsWithSources] = useState<ClaimWithSource[]>([]);
  const [linkedClaimsCount, setLinkedClaimsCount] = useState(0);

  useEffect(() => {
    const fetchClaims = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/claims/with-sources');
        if (!response.ok) {
          throw new Error('Failed to fetch claims');
        }
        const data: ClaimWithSource[] = await response.json();
        setClaimsWithSources(data);

        // Count claims linked to this thesis
        const linkedCount = data.filter((item) => {
          if (thesisType === 'macro') {
            return item.linkedTheses?.some((t) => t.id === thesisId);
          } else {
            return item.linkedViews?.some((v) => v.id === thesisId);
          }
        }).length;
        setLinkedClaimsCount(linkedCount);
        onClaimsLoaded?.(linkedCount);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchClaims();
  }, [thesisId, thesisType]);

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border border-border bg-muted/50 p-4', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading evidence claims...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/20 bg-destructive/10 p-4', className)}>
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // No claims linked - show research prompt
  if (linkedClaimsCount === 0) {
    return (
      <div className={cn('rounded-lg border border-amber-500/20 bg-amber-500/10 p-4', className)}>
        <div className="flex items-start gap-3">
          <SearchIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">No evidence claims yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              This thesis needs research to build supporting evidence. Process transcripts or articles using the{' '}
              <code className="bg-amber-500/15 px-1 rounded">/process-transcript</code> skill, then link the resulting claims to this thesis.
            </p>
            <Link
              href="/research"
              className="inline-flex items-center gap-1 text-xs text-foreground font-medium hover:text-amber-600 hover:underline transition-colors mt-2"
            >
              Go to Research Browser
              <ExternalLinkIcon className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Show UnifiedClaimsBrowser filtered for this thesis
  return (
    <div className={cn('space-y-2', className)}>
      <div className="text-sm text-muted-foreground">
        <span className="font-medium">{linkedClaimsCount}</span> claims linked to this thesis
      </div>
      <UnifiedClaimsBrowser
        claimsWithSources={claimsWithSources}
        initialLinkedToFilter={thesisId}
        compact={true}
      />
    </div>
  );
}
