'use client';

/**
 * AssetThesisDetailClient - Client wrapper for asset thesis detail page
 * Handles state for ManageRelatedMacroThesesDialog
 */

import { useState } from 'react';
import { ClientHierarchyBreadcrumb } from '@/components/ui/ClientHierarchyBreadcrumb';
import { ManageRelatedMacroThesesDialog } from './ManageRelatedMacroThesesDialog';

interface LinkedMacroThesis {
  id: string;
  macroThesisId: string;
  title: string;
  relationshipNote?: string | null;
}

interface AssetThesisDetailClientProps {
  assetThesisId: string;
  assetThesisTitle: string;
  linkedMacroTheses: LinkedMacroThesis[];
}

export function AssetThesisDetailClient({
  assetThesisId,
  assetThesisTitle,
  linkedMacroTheses,
}: AssetThesisDetailClientProps) {
  const [manageDialogOpen, setManageDialogOpen] = useState(false);

  // First linked macro thesis is treated as "primary" for display purposes
  const primaryMacroThesis = linkedMacroTheses.length > 0
    ? { id: linkedMacroTheses[0].macroThesisId, title: linkedMacroTheses[0].title }
    : null;

  // All other linked theses are "related"
  const relatedMacroTheses = linkedMacroTheses.slice(1);

  return (
    <>
      <ClientHierarchyBreadcrumb
        macroThesis={primaryMacroThesis}
        relatedMacroTheses={relatedMacroTheses.map((r) => ({
          id: r.macroThesisId,
          title: r.title,
          relationshipNote: r.relationshipNote,
        }))}
        assetView={{
          id: assetThesisId,
          title: assetThesisTitle,
        }}
        currentLevel="asset_thesis"
        onManageRelatedTheses={() => setManageDialogOpen(true)}
      />

      <ManageRelatedMacroThesesDialog
        assetThesisId={assetThesisId}
        assetThesisTitle={assetThesisTitle}
        primaryMacroThesisId={primaryMacroThesis?.id}
        currentRelated={linkedMacroTheses}
        isOpen={manageDialogOpen}
        onClose={() => setManageDialogOpen(false)}
      />
    </>
  );
}

