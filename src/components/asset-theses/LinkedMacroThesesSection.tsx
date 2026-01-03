'use client';

/**
 * LinkedMacroThesesSection - Client component wrapper for the Linked Macro Theses section
 * on asset-theses/[id] page, adding the + button to link new macro theses
 */

import { LinkButton } from '@/components/linking/LinkButton';
import { UnifiedMacroThesisBrowser } from '@/components/theses/UnifiedMacroThesisBrowser';
import type { MacroThesisListItem } from '@/db/queries/macroTheses';

interface LinkedMacroThesesSectionProps {
  assetThesisId: string;
  assetThesisTitle: string;
  linkedMacroTheses: MacroThesisListItem[];
}

export function LinkedMacroThesesSection({
  assetThesisId,
  assetThesisTitle,
  linkedMacroTheses,
}: LinkedMacroThesesSectionProps) {
  // Always show the section with the + button, even when empty
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">
          Linked Macro Theses ({linkedMacroTheses.length})
        </h3>
        <LinkButton
          sourceType="assetThesis"
          sourceId={assetThesisId}
          sourceTitle={assetThesisTitle}
          defaultTargetType="macroThesis"
        />
      </div>
      {linkedMacroTheses.length === 0 ? (
        <p className="text-sm text-slate-500">No macro theses linked to this asset thesis yet.</p>
      ) : (
        <UnifiedMacroThesisBrowser theses={linkedMacroTheses} />
      )}
    </div>
  );
}
