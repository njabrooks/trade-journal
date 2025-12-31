'use client';

/**
 * ClientHierarchyBreadcrumb - Client wrapper for HierarchyBreadcrumb with dialog state
 *
 * Handles the state for LinkToThesisDialog and LinkToViewDialog,
 * allowing server components to use the interactive breadcrumb.
 *
 * Part of Phase 2.6.6 Phase B: Inline Linking Workflows
 */

import { useState } from 'react';
import { HierarchyBreadcrumb } from './HierarchyBreadcrumb';
import { LinkToThesisDialog } from '../asset-theses/LinkToThesisDialog';
import { LinkToViewDialog } from '../strategies/LinkToViewDialog';

interface HierarchyLevel {
  id: string;
  title: string;
}

interface RelatedMacroThesis {
  id: string;
  title: string;
  relationshipNote?: string | null;
}

interface ClientHierarchyBreadcrumbProps {
  macroThesis?: HierarchyLevel | null; // Primary macro thesis
  relatedMacroTheses?: RelatedMacroThesis[]; // Related macro theses
  assetView?: HierarchyLevel | null;
  strategy?: HierarchyLevel | null;
  position?: HierarchyLevel | null;
  currentLevel: 'macro_thesis' | 'asset_view' | 'strategy' | 'position';
  showFullPath?: boolean;
  onManageRelatedTheses?: () => void; // Callback to manage related theses
}

export function ClientHierarchyBreadcrumb(props: ClientHierarchyBreadcrumbProps) {
  const [linkThesisDialogOpen, setLinkThesisDialogOpen] = useState(false);
  const [linkViewDialogOpen, setLinkViewDialogOpen] = useState(false);

  const handleLinkMacroThesis = () => {
    if (props.currentLevel === 'asset_view' && props.assetView) {
      setLinkThesisDialogOpen(true);
    }
  };

  const handleLinkAssetThesis = () => {
    if (props.currentLevel === 'strategy' && props.strategy) {
      setLinkViewDialogOpen(true);
    }
  };

  return (
    <>
      <HierarchyBreadcrumb
        {...props}
        relatedMacroTheses={props.relatedMacroTheses}
        onLinkMacroThesis={handleLinkMacroThesis}
        onLinkAssetThesis={handleLinkAssetThesis}
        onManageRelatedTheses={props.onManageRelatedTheses}
      />

      {/* Dialogs */}
      {props.currentLevel === 'asset_view' && props.assetView && (
        <LinkToThesisDialog
          viewId={props.assetView.id}
          viewTitle={props.assetView.title}
          currentThesisId={props.macroThesis?.id || null}
          isOpen={linkThesisDialogOpen}
          onClose={() => setLinkThesisDialogOpen(false)}
        />
      )}

      {props.currentLevel === 'strategy' && props.strategy && (
        <LinkToViewDialog
          strategyId={props.strategy.id}
          strategyLabel={props.strategy.title}
          currentViewId={props.assetView?.id || null}
          currentThesisId={props.macroThesis?.id || null}
          isOpen={linkViewDialogOpen}
          onClose={() => setLinkViewDialogOpen(false)}
        />
      )}
    </>
  );
}
