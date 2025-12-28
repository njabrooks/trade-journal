'use client';

import { useState } from 'react';
import type { DbMainClaim } from '@/types/claims';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Calendar, FileText } from 'lucide-react';

interface EvidenceEvent {
  id: string;
  date: Date;
  type: 'supporting' | 'rebutting';
  evidenceText: string;
  sourceName?: string;
  sourceUrl?: string;
}

interface ConfidenceChange {
  date: Date;
  from: string;
  to: string;
  reason?: string;
}

interface MainClaimEvolutionViewProps {
  mainClaim: DbMainClaim;
  evidenceEvents?: EvidenceEvent[];
  confidenceChanges?: ConfidenceChange[];
}

export function MainClaimEvolutionView({
  mainClaim,
  evidenceEvents = [],
  confidenceChanges = [],
}: MainClaimEvolutionViewProps) {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'supporting' | 'rebutting'>('all');

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredEvidence = evidenceEvents.filter(
    (event) => selectedFilter === 'all' || event.type === selectedFilter
  );

  const supportingCount = evidenceEvents.filter((e) => e.type === 'supporting').length;
  const rebuttingCount = evidenceEvents.filter((e) => e.type === 'rebutting').length;

  const getTypeColor = (type: 'supporting' | 'rebutting') => {
    return type === 'supporting' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Evidence Evolution</h3>
        <p className="text-sm text-slate-600">
          Track how this claim has accumulated evidence and evolved over time
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-slate-900">{evidenceEvents.length}</div>
          <div className="text-xs text-slate-600 mt-1">Total Evidence</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-emerald-700">{supportingCount}</div>
          <div className="text-xs text-emerald-600 mt-1">Supporting</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-700">{rebuttingCount}</div>
          <div className="text-xs text-amber-600 mt-1">Rebutting</div>
        </div>
      </div>

      {/* Evidence Ratio Visual */}
      {evidenceEvents.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-700 mb-2">Evidence Distribution</div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 transition-all"
              style={{ width: `${(supportingCount / evidenceEvents.length) * 100}%` }}
              title={`${supportingCount} supporting (${Math.round((supportingCount / evidenceEvents.length) * 100)}%)`}
            />
            <div
              className="bg-amber-500 transition-all"
              style={{ width: `${(rebuttingCount / evidenceEvents.length) * 100}%` }}
              title={`${rebuttingCount} rebutting (${Math.round((rebuttingCount / evidenceEvents.length) * 100)}%)`}
            />
          </div>
        </div>
      )}

      {/* Filter */}
      {evidenceEvents.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              selectedFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All ({evidenceEvents.length})
          </button>
          <button
            onClick={() => setSelectedFilter('supporting')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              selectedFilter === 'supporting'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}
          >
            Supporting ({supportingCount})
          </button>
          <button
            onClick={() => setSelectedFilter('rebutting')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              selectedFilter === 'rebutting'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            }`}
          >
            Rebutting ({rebuttingCount})
          </button>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Timeline
        </h4>

        {/* Confidence Changes */}
        {confidenceChanges.length > 0 && (
          <div className="space-y-3">
            {confidenceChanges.map((change, index) => (
              <div key={index} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-2 h-2 bg-purple-500 rounded-full mt-2" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500">{formatDate(change.date)}</span>
                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                      Confidence Change
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-700">
                    Confidence updated: <strong>{change.from}</strong> → <strong>{change.to}</strong>
                  </p>
                  {change.reason && (
                    <p className="text-xs text-slate-500 mt-1">{change.reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Evidence Events */}
        {filteredEvidence.length > 0 ? (
          <div className="space-y-3">
            {filteredEvidence.map((event) => (
              <div key={event.id} className="flex gap-3 items-start">
                <div className="flex-shrink-0 mt-2">
                  {event.type === 'supporting' ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-amber-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500">{formatDate(event.date)}</span>
                    <Badge className={getTypeColor(event.type)}>
                      {event.type}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-700">{event.evidenceText}</p>
                  {event.sourceName && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                      <FileText className="h-3 w-3" />
                      {event.sourceUrl ? (
                        <a
                          href={event.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-slate-700 underline"
                        >
                          {event.sourceName}
                        </a>
                      ) : (
                        <span>{event.sourceName}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : evidenceEvents.length > 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            No {selectedFilter} evidence found
          </p>
        ) : (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-600 mb-1">No evidence linked yet</p>
            <p className="text-xs text-slate-500">
              Evidence will appear here as it's linked to this claim
            </p>
          </div>
        )}
      </div>

      {/* Lifecycle Info */}
      <div className="pt-4 border-t border-slate-200">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-500">Created</span>
            <p className="text-slate-900 font-medium mt-1">
              {formatDate(mainClaim.createdAt)}
            </p>
          </div>
          <div>
            <span className="text-slate-500">Last Updated</span>
            <p className="text-slate-900 font-medium mt-1">
              {formatDate(mainClaim.updatedAt)}
            </p>
          </div>
          {mainClaim.lastEvidenceAddedAt && (
            <div>
              <span className="text-slate-500">Last Evidence Added</span>
              <p className="text-slate-900 font-medium mt-1">
                {formatDate(mainClaim.lastEvidenceAddedAt)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
