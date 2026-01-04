'use client';

import { ProvenanceLevel } from './ProvenanceLevel';

interface AssetThesisInfo {
  id: string;
  ticker: string;
  title: string;
  description: string | null;
}

interface AssetThesisLevelProps {
  assetThesis: AssetThesisInfo | null;
}

export function AssetThesisLevel({ assetThesis }: AssetThesisLevelProps) {
  const status = assetThesis ? 'linked' : 'missing';
  const title = assetThesis ? assetThesis.title : 'No Asset Thesis';
  const count = assetThesis ? 1 : 0;

  return (
    <ProvenanceLevel
      type="asset-thesis"
      title={title}
      count={count}
      status={status}
      href={assetThesis ? `/asset-theses/${assetThesis.id}` : undefined}
      defaultExpanded={!!assetThesis}
    >
      {assetThesis ? (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-500 mb-1">Ticker</div>
            <div className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-md font-mono text-sm font-semibold">
              {assetThesis.ticker}
            </div>
          </div>

          {assetThesis.description && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Description</div>
              <div className="text-sm text-slate-700 leading-relaxed">
                {assetThesis.description.length > 300
                  ? `${assetThesis.description.slice(0, 300)}...`
                  : assetThesis.description}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          No asset thesis linked. This strategy is not connected to the decision hierarchy.
        </p>
      )}
    </ProvenanceLevel>
  );
}
