'use client';

import { ProvenanceLevel } from './ProvenanceLevel';
import { cn } from '@/lib/utils';

interface Claim {
  id: string;
  title: string;
  claim: string;
  category: string;
  qualifier: string | null;
  status: string;
  mappingType: string;
  createdAt: Date;
}

interface ClaimsData {
  total: number;
  byMappingType: {
    supports: number;
    refutes: number;
    foundation: number;
  };
  items: Claim[];
}

interface ClaimsLevelProps {
  claims: ClaimsData;
}

const MAPPING_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  supports: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    label: 'Supports',
  },
  refutes: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    label: 'Refutes',
  },
  foundation: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    label: 'Foundation',
  },
};

export function ClaimsLevel({ claims }: ClaimsLevelProps) {
  const count = claims.total;
  const status = count > 0 ? 'linked' : 'weak-evidence';
  const title = count === 0
    ? 'No Claims'
    : `${count} Supporting ${count === 1 ? 'Claim' : 'Claims'}`;

  return (
    <ProvenanceLevel
      type="claims"
      title={title}
      count={count}
      status={status}
      defaultExpanded={count > 0}
    >
      {count === 0 ? (
        <div className="text-sm text-slate-500">
          <p className="mb-2">
            No claims linked to the asset thesis.
          </p>
          <p className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
            <strong>Note:</strong> Claims provide evidence-based support for the investment thesis.
            Consider adding research claims to strengthen the decision foundation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary Statistics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-green-50 rounded-md">
              <div className="text-xs text-slate-600 mb-1">Supports</div>
              <div className="text-lg font-bold text-green-700">
                {claims.byMappingType.supports}
              </div>
            </div>
            <div className="p-3 bg-blue-50 rounded-md">
              <div className="text-xs text-slate-600 mb-1">Foundation</div>
              <div className="text-lg font-bold text-blue-700">
                {claims.byMappingType.foundation}
              </div>
            </div>
            <div className="p-3 bg-red-50 rounded-md">
              <div className="text-xs text-slate-600 mb-1">Refutes</div>
              <div className="text-lg font-bold text-red-700">
                {claims.byMappingType.refutes}
              </div>
            </div>
          </div>

          {/* Claims List (truncated to first 5) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recent Claims (showing {Math.min(5, count)} of {count})
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {claims.items.slice(0, 5).map((claim) => {
                const mappingStyle = MAPPING_TYPE_STYLES[claim.mappingType] || {
                  bg: 'bg-slate-100',
                  text: 'text-slate-800',
                  label: claim.mappingType,
                };

                return (
                  <div
                    key={claim.id}
                    className="p-3 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="font-medium text-sm">{claim.title}</div>
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0',
                        mappingStyle.bg,
                        mappingStyle.text
                      )}>
                        {mappingStyle.label}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600 line-clamp-2">
                      {claim.claim}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-slate-500">{claim.category}</span>
                      {claim.qualifier && (
                        <>
                          <span className="text-xs text-slate-300">•</span>
                          <span className="text-xs text-slate-500 italic">
                            {claim.qualifier}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {count > 5 && (
              <p className="text-xs text-slate-500 text-center pt-2">
                + {count - 5} more claims. View full asset thesis for complete list.
              </p>
            )}
          </div>
        </div>
      )}
    </ProvenanceLevel>
  );
}
