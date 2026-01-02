'use client';

/**
 * ClientHierarchyBreadcrumb - Client wrapper for HierarchyBreadcrumb with dialog state
 *
 * Handles the state for StandardLinkDialog,
 * allowing server components to use the interactive breadcrumb.
 *
 * Part of Phase 2.6.6 Phase B: Inline Linking Workflows
 * Updated to use StandardLinkDialog for consistency
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HierarchyBreadcrumb } from './HierarchyBreadcrumb';
import { StandardLinkDialog } from '../linking/StandardLinkDialog';

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
  const router = useRouter();
  const [linkingEntity, setLinkingEntity] = useState<{
    sourceType: 'assetThesis' | 'strategy';
    sourceId: string;
    sourceTitle: string;
  } | null>(null);

  const handleLinkMacroThesis = () => {
    if (props.currentLevel === 'asset_view' && props.assetView) {
      setLinkingEntity({
        sourceType: 'assetThesis',
        sourceId: props.assetView.id,
        sourceTitle: props.assetView.title,
      });
    }
  };

  const handleLinkAssetThesis = () => {
    if (props.currentLevel === 'strategy' && props.strategy) {
      setLinkingEntity({
        sourceType: 'strategy',
        sourceId: props.strategy.id,
        sourceTitle: props.strategy.title,
      });
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

      {/* Standard Link Dialog */}
      {linkingEntity && (
        <StandardLinkDialog
          sourceType={linkingEntity.sourceType}
          sourceId={linkingEntity.sourceId}
          sourceTitle={linkingEntity.sourceTitle}
          isOpen={!!linkingEntity}
          onClose={() => setLinkingEntity(null)}
          onSuccess={() => {
            setLinkingEntity(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
