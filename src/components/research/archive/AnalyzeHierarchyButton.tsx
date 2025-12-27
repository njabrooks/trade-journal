'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface AnalyzeHierarchyButtonProps {
  insightId: string;
  model?: string;
}

export function AnalyzeHierarchyButton({
  insightId,
  model,
}: AnalyzeHierarchyButtonProps) {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/research/analyze-hierarchy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insightId, model }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || data.error || 'Failed to analyze hierarchy');
        return;
      }

      // Show success message and trigger refresh
      if (data.recommendationIds && data.recommendationIds.length > 0) {
        // Trigger a custom event to refresh recommendations panel
        window.dispatchEvent(new CustomEvent('recommendations-updated'));
      }
      
      // Refresh the page to show recommendations
      // Small delay to ensure database write completes
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze hierarchy');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div>
      <Button onClick={handleAnalyze} disabled={analyzing} variant="outline">
        {analyzing ? (
          <>
            <Spinner className="size-4 mr-2" />
            Analyzing Hierarchy...
          </>
        ) : (
          'Analyze Hierarchy'
        )}
      </Button>
      {error && (
        <div className="mt-2">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}

