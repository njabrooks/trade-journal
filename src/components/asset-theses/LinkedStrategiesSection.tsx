'use client';

/**
 * LinkedStrategiesSection - Client component wrapper for the Linked Strategies section
 * on asset-theses/[id] page, adding the + button to link new strategies
 *
 * Note: Strategy → Asset Thesis is a one-to-one relationship, so linking
 * a strategy here will unlink it from any previous asset thesis.
 */

import { LinkButton } from '@/components/linking/LinkButton';
import { UnifiedStrategiesBrowser } from '@/components/strategies/UnifiedStrategiesBrowser';
import type { StrategyListItem } from '@/db/queries/strategies';

interface LinkedStrategiesSectionProps {
  assetThesisId: string;
  assetThesisTitle: string;
  linkedStrategies: StrategyListItem[];
  embedded?: boolean;
}

export function LinkedStrategiesSection({
  assetThesisId,
  assetThesisTitle,
  linkedStrategies,
  embedded = false,
}: LinkedStrategiesSectionProps) {
  const content = (
    <>
      {linkedStrategies.length === 0 ? (
        <p className="text-sm text-slate-500">No strategies linked to this asset thesis yet.</p>
      ) : (
        <UnifiedStrategiesBrowser strategies={linkedStrategies} />
      )}
    </>
  );

  const linkButton = (
    <LinkButton
      sourceType="assetThesis"
      sourceId={assetThesisId}
      sourceTitle={assetThesisTitle}
      defaultTargetType="strategy"
    />
  );

  // Embedded mode: no outer container (used inside Accordion)
  if (embedded) {
    return (
      <div>
        <div className="flex justify-end mb-2">
          {linkButton}
        </div>
        {content}
      </div>
    );
  }

  // Standalone mode: full container with header
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">
          Linked Strategies ({linkedStrategies.length})
        </h3>
        {linkButton}
      </div>
      {content}
    </div>
  );
}
