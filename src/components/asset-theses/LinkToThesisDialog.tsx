'use client';

/**
 * LinkToThesisDialog - Dialog for linking Asset Theses to Macro Theses
 *
 * Migrated to use UnifiedLinkingDialog with custom MacroThesisSelector.
 * Supports both Link to Existing and Create New & Link tabs.
 */

import { UnifiedLinkingDialog } from '../linking/UnifiedLinkingDialog';
import { MacroThesisSelector } from './MacroThesisSelector';
import { useRouter } from 'next/navigation';

interface LinkToThesisDialogProps {
  viewId: string;
  viewTitle: string;
  isOpen: boolean;
  onClose: () => void;
  currentThesisId?: string | null;
}

export function LinkToThesisDialog({
  viewId,
  viewTitle,
  isOpen,
  onClose,
  currentThesisId,
}: LinkToThesisDialogProps) {
  const router = useRouter();

  const handleSelectMacroThesis = async (macroThesisId: string) => {
    const response = await fetch(`/api/asset-theses/${viewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primaryMacroThesisId: macroThesisId,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to link macro thesis');
    }

    router.refresh();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <UnifiedLinkingDialog
      sourceType="assetThesis"
      sourceId={viewId}
      sourceTitle={viewTitle}
      targetType="macroThesis"
      autoLinkContext={{ assetThesisId: viewId }}
      onClose={onClose}
      existingItemsComponent={
        <MacroThesisSelector
          onSelect={handleSelectMacroThesis}
          onCancel={onClose}
          currentThesisId={currentThesisId}
        />
      }
    />
  );
}
