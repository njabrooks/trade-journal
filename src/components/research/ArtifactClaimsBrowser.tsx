'use client';

import { useState, useEffect } from 'react';
import { UnifiedClaimsBrowser } from './UnifiedClaimsBrowser';
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
    />
  );
}
