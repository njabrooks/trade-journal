'use client';

import { UnifiedLinkingDialog } from '../linking/UnifiedLinkingDialog';
import { ExistingEntityList } from '../linking/ExistingEntityList';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

interface AssetThesis {
  id: string;
  title: string;
  ticker: string | null;
  direction: string | null;
  status: string;
}

interface LinkAssetThesesToMacroDialogProps {
  macroThesisId: string;
  macroThesisTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function LinkAssetThesesToMacroDialog({
  macroThesisId,
  macroThesisTitle,
  isOpen,
  onClose,
}: LinkAssetThesesToMacroDialogProps) {
  const router = useRouter();

  const handleSelectAssetThesis = async (assetThesisId: string) => {
    const response = await fetch(`/api/asset-theses/${assetThesisId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ macroThesisId }),
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
      sourceType="macroThesis"
      sourceId={macroThesisId}
      sourceTitle={macroThesisTitle}
      targetType="assetThesis"
      autoLinkContext={{ macroThesisId }}
      onClose={onClose}
      existingItemsComponent={
        <ExistingEntityList<AssetThesis>
          entityType="assetThesis"
          onSelect={handleSelectAssetThesis}
          onCancel={onClose}
          renderItem={(thesis) => (
            <div className="space-y-1">
              <div className="font-medium text-slate-900">{thesis.title}</div>
              <div className="flex items-center gap-2 text-xs">
                {thesis.ticker && (
                  <span className="font-mono text-slate-600">{thesis.ticker}</span>
                )}
                {thesis.direction && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs">
                    {thesis.direction}
                  </Badge>
                )}
                <Badge className="bg-slate-100 text-slate-700 text-xs">
                  {thesis.status}
                </Badge>
              </div>
            </div>
          )}
        />
      }
    />
  );
}

