'use client';

import { ChevronRight } from 'lucide-react';
import { PositionsLevel } from './PositionsLevel';
import { StrategyLevel } from './StrategyLevel';
import { AssetThesisLevel } from './AssetThesisLevel';
import { MacroThesesLevel } from './MacroThesesLevel';
import { ClaimsLevel } from './ClaimsLevel';
import type { ProvenanceData } from '@/app/api/strategies/[id]/provenance/route';

interface StrategyProvenanceChainProps {
  data: ProvenanceData;
}

export function StrategyProvenanceChain({ data }: StrategyProvenanceChainProps) {
  const { strategy, assetThesis, macroTheses, claims, positions } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          Strategy Provenance Chain
        </h3>
        <p className="text-sm text-slate-600">
          Trace the full decision hierarchy from positions back to macro theses and supporting claims.
          This view shows how this strategy connects to the broader investment framework.
        </p>
      </div>

      {/* Desktop: Horizontal flow with arrows */}
      <div className="hidden lg:block">
        <div className="flex items-start gap-4 overflow-x-auto pb-4">
          <div className="flex-shrink-0 w-80">
            <PositionsLevel positions={positions} />
          </div>

          <div className="flex-shrink-0 flex items-center pt-12">
            <ChevronRight className="h-6 w-6 text-slate-400" />
          </div>

          <div className="flex-shrink-0 w-80">
            <StrategyLevel strategy={strategy} />
          </div>

          <div className="flex-shrink-0 flex items-center pt-12">
            <ChevronRight className="h-6 w-6 text-slate-400" />
          </div>

          <div className="flex-shrink-0 w-80">
            <AssetThesisLevel assetThesis={assetThesis} />
          </div>

          <div className="flex-shrink-0 flex items-center pt-12">
            <ChevronRight className="h-6 w-6 text-slate-400" />
          </div>

          <div className="flex-shrink-0 w-96">
            <MacroThesesLevel macroTheses={macroTheses} />
          </div>

          <div className="flex-shrink-0 flex items-center pt-12">
            <ChevronRight className="h-6 w-6 text-slate-400" />
          </div>

          <div className="flex-shrink-0 w-96">
            <ClaimsLevel claims={claims} />
          </div>
        </div>
      </div>

      {/* Mobile/Tablet: Vertical stack */}
      <div className="lg:hidden space-y-4">
        <PositionsLevel positions={positions} />

        <div className="flex justify-center">
          <ChevronRight className="h-6 w-6 text-slate-400 rotate-90" />
        </div>

        <StrategyLevel strategy={strategy} />

        <div className="flex justify-center">
          <ChevronRight className="h-6 w-6 text-slate-400 rotate-90" />
        </div>

        <AssetThesisLevel assetThesis={assetThesis} />

        <div className="flex justify-center">
          <ChevronRight className="h-6 w-6 text-slate-400 rotate-90" />
        </div>

        <MacroThesesLevel macroTheses={macroTheses} />

        <div className="flex justify-center">
          <ChevronRight className="h-6 w-6 text-slate-400 rotate-90" />
        </div>

        <ClaimsLevel claims={claims} />
      </div>

      {/* Summary Stats */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
        <h4 className="text-sm font-semibold text-slate-700 mb-4">
          Provenance Summary
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">Positions</div>
            <div className="text-2xl font-bold text-slate-900">
              {positions.filter(p => p.status === 'open' || p.status === 'assigned').length}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Asset Thesis</div>
            <div className="text-2xl font-bold text-slate-900">
              {assetThesis ? '1' : '0'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Macro Theses</div>
            <div className="text-2xl font-bold text-slate-900">
              {macroTheses.length}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Total Claims</div>
            <div className="text-2xl font-bold text-slate-900">
              {claims.total}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Evidence Ratio</div>
            <div className="text-2xl font-bold text-slate-900">
              {positions.length > 0
                ? `${claims.total}:${positions.filter(p => p.status === 'open' || p.status === 'assigned').length}`
                : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">claims per position</div>
          </div>
        </div>
      </div>
    </div>
  );
}
