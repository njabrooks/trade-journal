'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MainClaim } from '@/types/claims';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

interface PromoteClaimDialogProps {
  claim: MainClaim;
  insightId: string;
  onClose: () => void;
}

export function PromoteClaimDialog({ claim, insightId, onClose }: PromoteClaimDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePromote = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/research/promote-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insightId,
          claimId: claim.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to promote claim');
      }

      const result = await response.json();
      setSuccess(true);

      // Refresh the page to show updated data
      setTimeout(() => {
        router.refresh();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const getQualifierColor = (qualifier: string) => {
    switch (qualifier) {
      case 'high':
        return 'bg-emerald-100 text-emerald-700';
      case 'medium':
        return 'bg-blue-100 text-blue-700';
      case 'low':
        return 'bg-amber-100 text-amber-700';
      case 'exploratory':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-slate-900">
              Promote to Main Claim
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            disabled={loading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Explanation */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-purple-900">
              <strong>Promoting this claim</strong> will create a first-class main claim entity
              that can accumulate evidence from multiple audits over time and link to multiple
              theses/views with independent lifecycle tracking.
            </p>
          </div>

          {/* Claim Preview */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Claim</h3>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-start gap-2 mb-3">
                  <Badge className={getQualifierColor(claim.qualifier)}>
                    {claim.qualifier} confidence
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {claim.category}
                  </Badge>
                  {claim.time_horizon && (
                    <Badge variant="outline" className="text-xs">
                      {claim.time_horizon.replace('_', ' ')}
                    </Badge>
                  )}
                </div>
                <p className="font-medium text-slate-900 leading-snug">{claim.claim}</p>
                {claim.relevant_tickers && claim.relevant_tickers.length > 0 && (
                  <div className="flex gap-1 mt-3">
                    {claim.relevant_tickers.map((ticker) => (
                      <span
                        key={ticker}
                        className="inline-flex px-2 py-0.5 text-xs font-mono bg-white text-slate-900 rounded border border-slate-200"
                      >
                        {ticker}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {claim.evidence && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Evidence</h3>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm text-slate-700">{claim.evidence}</p>
                </div>
              </div>
            )}

            {claim.reasoning && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Reasoning</h3>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm text-slate-700">{claim.reasoning}</p>
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-900">Error promoting claim</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Success Display */}
          {success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-emerald-900">Claim promoted successfully!</p>
                <p className="text-sm text-emerald-700 mt-1">
                  This claim is now a first-class main claim that can accumulate evidence.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePromote}
            disabled={loading || success}
          >
            {loading ? 'Promoting...' : success ? 'Promoted!' : 'Promote to Main Claim'}
          </Button>
        </div>
      </div>
    </div>
  );
}
