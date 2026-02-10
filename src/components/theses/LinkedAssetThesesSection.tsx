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
  embedded?: boolean;
}

export function LinkedAssetThesesSection({
  macroThesisId,
  macroThesisTitle,
  linkedAssetTheses,
  embedded = false,
}: LinkedAssetThesesSectionProps) {
  const content = (
    <>
      {linkedAssetTheses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No asset theses linked to this macro thesis yet.</p>
      ) : (
        <UnifiedAssetThesisBrowser assetTheses={linkedAssetTheses} />
      )}
    </>
  );

  const linkButton = (
    <LinkButton
      sourceType="macroThesis"
      sourceId={macroThesisId}
      sourceTitle={macroThesisTitle}
    />
  );

  if (embedded) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">
            Includes asset theses where this is the primary macro thesis, or a related macro thesis.
          </p>
          {linkButton}
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold">
            Asset Theses ({linkedAssetTheses.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Includes asset theses where this is the primary macro thesis, or a related macro thesis.
          </p>
        </div>
        {linkButton}
      </div>
      {content}
    </div>
  );
}
