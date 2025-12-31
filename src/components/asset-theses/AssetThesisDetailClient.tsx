'use client';

/**
 * AssetThesisDetailClient - Client wrapper for asset thesis detail page
 * Handles state for ManageRelatedMacroThesesDialog
 */

import { useState } from 'react';
import { ClientHierarchyBreadcrumb } from '@/components/ui/ClientHierarchyBreadcrumb';
import { ManageRelatedMacroThesesDialog } from './ManageRelatedMacroThesesDialog';

interface RelatedMacroThesis {
  id: string;
  macroThesisId: string;
  title: string;
  relationshipNote?: string | null;
}

interface AssetThesisDetailClientProps {
  assetThesisId: string;
  assetThesisTitle: string;
  primaryMacroThesis: { id: string; title: string } | null;
  relatedMacroTheses: RelatedMacroThesis[];
}

export function AssetThesisDetailClient({
  assetThesisId,
  assetThesisTitle,
  primaryMacroThesis,
  relatedMacroTheses,
}: AssetThesisDetailClientProps) {
  const [manageDialogOpen, setManageDialogOpen] = useState(false);

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
        currentLevel="asset_view"
        onManageRelatedTheses={() => setManageDialogOpen(true)}
      />

      <ManageRelatedMacroThesesDialog
        assetThesisId={assetThesisId}
        assetThesisTitle={assetThesisTitle}
        primaryMacroThesisId={primaryMacroThesis?.id}
        currentRelated={relatedMacroTheses}
        isOpen={manageDialogOpen}
        onClose={() => setManageDialogOpen(false)}
      />
    </>
  );
}

