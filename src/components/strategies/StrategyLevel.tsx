'use client';

import { ProvenanceLevel } from './ProvenanceLevel';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface StrategyInfo {
  id: string;
  strategyKey: string;
  assetThesisId: string | null;
}

interface StrategyLevelProps {
  strategy: StrategyInfo;
}

export function StrategyLevel({ strategy }: StrategyLevelProps) {
  const hasAssetThesis = !!strategy.assetThesisId;
  const status = hasAssetThesis ? 'linked' : 'missing';
  const title = strategy.strategyKey;

  return (
    <ProvenanceLevel
      type="strategy"
      title={title}
      count={1}
      status={status}
      href={`/strategies/${strategy.id}/triage`}
      defaultExpanded={true}
    >
      <div className="space-y-3">
        <div>
          <div className="text-xs text-slate-500 mb-1">Strategy Key</div>
          <div className="font-mono text-sm">{strategy.strategyKey}</div>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-md bg-slate-50">
          {hasAssetThesis ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-slate-700">
                Linked to Asset Thesis
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-slate-700">
                No Asset Thesis linked - strategy may be missing decision context
              </span>
            </>
          )}
        </div>

        {!hasAssetThesis && (
          <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
            <strong>Recommendation:</strong> Link this strategy to an Asset Thesis to
            connect it to macro theses and supporting claims.
          </p>
        )}
      </div>
    </ProvenanceLevel>
  );
}
