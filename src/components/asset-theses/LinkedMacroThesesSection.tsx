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
  embedded?: boolean;
}

export function LinkedMacroThesesSection({
  assetThesisId,
  assetThesisTitle,
  linkedMacroTheses,
  embedded = false,
}: LinkedMacroThesesSectionProps) {
  const content = (
    <>
      {linkedMacroTheses.length === 0 ? (
        <p className="text-sm text-slate-500">No macro theses linked to this asset thesis yet.</p>
      ) : (
        <UnifiedMacroThesisBrowser theses={linkedMacroTheses} />
      )}
    </>
  );

  const linkButton = (
    <LinkButton
      sourceType="assetThesis"
      sourceId={assetThesisId}
      sourceTitle={assetThesisTitle}
      defaultTargetType="macroThesis"
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
          Linked Macro Theses ({linkedMacroTheses.length})
        </h3>
        {linkButton}
      </div>
      {content}
    </div>
  );
}
