'use client';

import { useState } from 'react';
import type { DbMainClaim } from '@/types/claims';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

interface MainClaimCardProps {
  mainClaim: DbMainClaim;
  evidenceCount?: {
    supporting: number;
    rebutting: number;
  };
  onViewDetails?: (claimId: string) => void;
}

export function MainClaimCard({ mainClaim, evidenceCount, onViewDetails }: MainClaimCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getQualifierColor = (qualifier: string | null) => {
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'invalidated':
        return 'bg-red-100 text-red-700';
      case 'merged':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-3 w-3" />;
      case 'invalidated':
        return <AlertTriangle className="h-3 w-3" />;
      case 'merged':
        return <TrendingUp className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return null;
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge className={getStatusColor(mainClaim.status)} title="Claim status">
              {getStatusIcon(mainClaim.status)}
              <span className="ml-1">{mainClaim.status}</span>
            </Badge>
            {mainClaim.qualifier && (
              <Badge className={getQualifierColor(mainClaim.qualifier)}>
                {mainClaim.qualifier} confidence
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {mainClaim.category}
            </Badge>
            {mainClaim.timeHorizon && (
              <Badge variant="outline" className="text-xs">
                {mainClaim.timeHorizon.replace('_', ' ')}
              </Badge>
            )}
            {evidenceCount && (
              <>
                {evidenceCount.supporting > 0 && (
                  <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                    +{evidenceCount.supporting} supporting
                  </Badge>
                )}
                {evidenceCount.rebutting > 0 && (
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                    −{evidenceCount.rebutting} rebutting
                  </Badge>
                )}
              </>
            )}
          </div>
          <h3 className="font-semibold text-slate-900 leading-snug mb-1">{mainClaim.title}</h3>
          {mainClaim.relevantTickers && mainClaim.relevantTickers.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {mainClaim.relevantTickers.map((ticker) => (
                <span
                  key={ticker}
                  className="inline-flex px-2 py-0.5 text-xs font-mono bg-slate-100 text-slate-900 rounded"
                >
                  {ticker}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 ml-4">
          <Button variant="outline" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>
          {onViewDetails && (
            <Button size="sm" onClick={() => onViewDetails(mainClaim.id)}>
              Details
            </Button>
          )}
        </div>
      </div>

      {/* Claim Summary (Always Visible) */}
      <div className="text-sm text-slate-700 mb-3">
        <p className="leading-relaxed">{mainClaim.claim}</p>
      </div>

      {/* Metadata Footer */}
      <div className="flex items-center gap-4 text-xs text-slate-500 pt-3 border-t border-slate-100">
        <span title="Created date">
          Created {formatDate(mainClaim.createdAt)}
        </span>
        {mainClaim.lastEvidenceAddedAt && (
          <span title="Last evidence added" className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Evidence added {formatDate(mainClaim.lastEvidenceAddedAt)}
          </span>
        )}
      </div>

      {/* Expanded Toulmin Structure */}
      {isExpanded && (
        <div className="space-y-4 mt-4 pt-4 border-t border-slate-200">
          {/* Evidence */}
          {mainClaim.evidence && (
            <div>
              <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                Evidence
                <span
                  className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-slate-200 text-slate-600 cursor-help"
                  title="The factual data or observations supporting the claim"
                >
                  <Info className="h-2 w-2" />
                </span>
              </h5>
              <p className="text-sm text-slate-700">{mainClaim.evidence}</p>
            </div>
          )}

          {/* Reasoning */}
          {mainClaim.reasoning && (
            <div>
              <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                Reasoning
                <span
                  className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-slate-200 text-slate-600 cursor-help"
                  title="The logical connection between evidence and claim"
                >
                  <Info className="h-2 w-2" />
                </span>
              </h5>
              <p className="text-sm text-slate-700">{mainClaim.reasoning}</p>
            </div>
          )}

          {/* Backing */}
          {mainClaim.backing && (
            <div>
              <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                Backing
                <span
                  className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-slate-200 text-slate-600 cursor-help"
                  title="Additional support for why the reasoning is valid"
                >
                  <Info className="h-2 w-2" />
                </span>
              </h5>
              <p className="text-sm text-slate-700">{mainClaim.backing}</p>
            </div>
          )}

          {/* Rebuttal */}
          {mainClaim.rebuttal && (
            <div>
              <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                Rebuttal / Counter-Arguments
                <span
                  className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-slate-200 text-slate-600 cursor-help"
                  title="Conditions under which the claim might not hold or counter-evidence"
                >
                  <Info className="h-2 w-2" />
                </span>
              </h5>
              <p className="text-sm text-slate-700">{mainClaim.rebuttal}</p>
            </div>
          )}

          {/* Confidence Evolution */}
          {mainClaim.confidenceEvolution && (
            <div>
              <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Confidence Evolution
              </h5>
              <div className="bg-slate-50 rounded-lg p-3">
                <pre className="text-xs text-slate-600 overflow-x-auto">
                  {JSON.stringify(mainClaim.confidenceEvolution as Record<string, unknown>, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
