'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RecommendationCard } from './RecommendationCard';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { ResearchHierarchyRecommendation } from '@/db/schema';

interface HierarchyRecommendationsPanelProps {
  insightId: string;
}

export function HierarchyRecommendationsPanel({
  insightId,
}: HierarchyRecommendationsPanelProps) {
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<
    ResearchHierarchyRecommendation[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecommendations();
  }, [insightId]);

  // Reload when recommendations are updated (from AnalyzeHierarchyButton)
  useEffect(() => {
    const handleRecommendationsUpdated = () => {
      // Delay slightly to ensure database write completes
      setTimeout(() => {
        loadRecommendations();
      }, 500);
    };
    window.addEventListener('recommendations-updated', handleRecommendationsUpdated);
    return () => window.removeEventListener('recommendations-updated', handleRecommendationsUpdated);
  }, []);

  const loadRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/research/recommendations?insightId=${insightId}`
      );
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to load recommendations');
        return;
      }

      const recs = data.recommendations || [];
      console.log('Loaded recommendations:', recs.length, recs);
      setRecommendations(recs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (
    recommendationId: string,
    action: 'accept' | 'reject' | 'modify',
    modifications?: any
  ) => {
    try {
      const response = await fetch(`/api/research/recommendations/${recommendationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, modifications }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to update recommendation');
      }

      // Reload recommendations and refresh page
      await loadRecommendations();
      router.refresh();
    } catch (err) {
      console.error('Error updating recommendation:', err);
      alert(err instanceof Error ? err.message : 'Failed to update recommendation');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center gap-2">
          <Spinner className="size-4" />
          <span className="text-sm text-slate-600">Loading recommendations...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-sm text-red-700">{error}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={loadRecommendations}
          className="mt-2"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <p className="text-sm text-slate-600">
          No recommendations yet. Click "Analyze Hierarchy" to generate AI recommendations.
        </p>
        {error && (
          <p className="text-sm text-red-600 mt-2">Error: {error}</p>
        )}
      </div>
    );
  }

  // Group recommendations by status
  const pending = recommendations.filter((r) => r.status === 'pending');
  const accepted = recommendations.filter((r) => r.status === 'accepted');
  const rejected = recommendations.filter((r) => r.status === 'rejected');
  const modified = recommendations.filter((r) => r.status === 'modified');

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">AI Recommendations</h3>
        <Button size="sm" variant="outline" onClick={loadRecommendations}>
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-slate-600">
          Total: <strong>{recommendations.length}</strong>
        </span>
        {pending.length > 0 && (
          <span className="text-slate-600">
            Pending: <strong className="text-blue-600">{pending.length}</strong>
          </span>
        )}
        {accepted.length > 0 && (
          <span className="text-slate-600">
            Accepted: <strong className="text-emerald-600">{accepted.length}</strong>
          </span>
        )}
        {rejected.length > 0 && (
          <span className="text-slate-600">
            Rejected: <strong className="text-red-600">{rejected.length}</strong>
          </span>
        )}
      </div>

      {/* Pending Recommendations */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-slate-700">Pending ({pending.length})</h4>
          {pending.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              onAction={(action, modifications) =>
                handleAction(rec.id, action, modifications)
              }
            />
          ))}
        </div>
      )}

      {/* Accepted Recommendations */}
      {accepted.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-emerald-700">Accepted ({accepted.length})</h4>
          {accepted.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              onAction={(action, modifications) =>
                handleAction(rec.id, action, modifications)
              }
            />
          ))}
        </div>
      )}

      {/* Rejected Recommendations */}
      {rejected.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-red-700">Rejected ({rejected.length})</h4>
          {rejected.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              onAction={(action, modifications) =>
                handleAction(rec.id, action, modifications)
              }
            />
          ))}
        </div>
      )}

      {/* Modified Recommendations */}
      {modified.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-yellow-700">Modified ({modified.length})</h4>
          {modified.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              onAction={(action, modifications) =>
                handleAction(rec.id, action, modifications)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

