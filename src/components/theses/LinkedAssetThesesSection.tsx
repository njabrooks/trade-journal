'use client';

/**
 * LinkedAssetThesesSection - Client component wrapper for the Asset Theses section
 * on macro-theses/[id] page, adding the + button to link new asset theses
 */

import { LinkButton } from '@/components/linking/LinkButton';
import { UnifiedAssetThesisBrowser } from '@/components/asset-theses/UnifiedAssetThesisBrowser';
import type { AssetThesisListItem } from '@/db/queries/assetTheses';

interface LinkedAssetThesesSectionProps {
  macroThesisId: string;
  macroThesisTitle: string;
  linkedAssetTheses: AssetThesisListItem[];
}

export function LinkedAssetThesesSection({
  macroThesisId,
  macroThesisTitle,
  linkedAssetTheses,
}: LinkedAssetThesesSectionProps) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold">
            Asset Theses ({linkedAssetTheses.length})
          </h3>
          <p className="text-xs text-slate-500">
            Includes asset theses where this is the primary macro thesis, or a related macro thesis.
          </p>
        </div>
        <LinkButton
          sourceType="macroThesis"
          sourceId={macroThesisId}
          sourceTitle={macroThesisTitle}
        />
      </div>
      {linkedAssetTheses.length === 0 ? (
        <p className="text-sm text-slate-500">No asset theses linked to this macro thesis yet.</p>
      ) : (
        <UnifiedAssetThesisBrowser assetTheses={linkedAssetTheses} />
      )}
    </div>
  );
}
