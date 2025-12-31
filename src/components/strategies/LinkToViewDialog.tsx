'use client';

/**
 * LinkToViewDialog - Dialog for linking Strategies to Asset Theses
 *
 * Migrated to use UnifiedLinkingDialog with custom AssetThesisSelector.
 * Supports both Link to Existing and Create New & Link tabs.
 */

import { UnifiedLinkingDialog } from '../linking/UnifiedLinkingDialog';
import { AssetThesisSelector } from './AssetThesisSelector';
import { useRouter } from 'next/navigation';

interface LinkToViewDialogProps {
  strategyId: string;
  strategyLabel: string;
  isOpen: boolean;
  onClose: () => void;
  currentViewId?: string | null;
  currentThesisId?: string | null;
}

export function LinkToViewDialog({
  strategyId,
  strategyLabel,
  isOpen,
  onClose,
  currentViewId,
  currentThesisId,
}: LinkToViewDialogProps) {
  const router = useRouter();

  const handleSelectAssetThesis = async (assetThesisId: string) => {
    // Fetch the selected view to get its macro thesis ID
    const viewResponse = await fetch(`/api/asset-theses/${assetThesisId}`);
    if (!viewResponse.ok) {
      throw new Error('Failed to fetch asset thesis details');
    }
    const selectedView = await viewResponse.json();

    // Link the strategy to both the asset thesis and its macro thesis (if it has one)
    const response = await fetch(`/api/strategies/${strategyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetThesisId,
        macroThesisId: selectedView.macroThesisId || currentThesisId,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to link asset thesis');
    }

    router.refresh();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <UnifiedLinkingDialog
      sourceType="strategy"
      sourceId={strategyId}
      sourceTitle={strategyLabel}
      targetType="assetThesis"
      autoLinkContext={{ assetThesisId: currentViewId || undefined, macroThesisId: currentThesisId || undefined }}
      onClose={onClose}
      existingItemsComponent={
        <AssetThesisSelector
          onSelect={handleSelectAssetThesis}
          onCancel={onClose}
          currentViewId={currentViewId}
        />
      }
    />
  );
}
