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
}

export function LinkedStrategiesSection({
  assetThesisId,
  assetThesisTitle,
  linkedStrategies,
}: LinkedStrategiesSectionProps) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">
          Linked Strategies ({linkedStrategies.length})
        </h3>
        <LinkButton
          sourceType="assetThesis"
          sourceId={assetThesisId}
          sourceTitle={assetThesisTitle}
          defaultTargetType="strategy"
        />
      </div>
      {linkedStrategies.length === 0 ? (
        <p className="text-sm text-slate-500">No strategies linked to this asset thesis yet.</p>
      ) : (
        <UnifiedStrategiesBrowser strategies={linkedStrategies} />
      )}
    </div>
  );
}
