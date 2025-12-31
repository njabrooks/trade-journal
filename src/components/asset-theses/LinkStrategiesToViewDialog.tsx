'use client';

import { UnifiedLinkingDialog } from '../linking/UnifiedLinkingDialog';
import { ExistingEntityList } from '../linking/ExistingEntityList';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

interface Strategy {
  id: string;
  label: string;
  strategyKey: string;
  direction: string | null;
  status: string;
}

interface LinkStrategiesToViewDialogProps {
  assetThesisId: string;
  assetThesisTitle: string;
  macroThesisId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function LinkStrategiesToViewDialog({
  assetThesisId,
  assetThesisTitle,
  macroThesisId,
  isOpen,
  onClose,
}: LinkStrategiesToViewDialogProps) {
  const router = useRouter();

  const handleSelectStrategy = async (strategyId: string) => {
    const response = await fetch(`/api/strategies/${strategyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetThesisId,
        macroThesisId,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to link strategy');
    }

    router.refresh();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <UnifiedLinkingDialog
      sourceType="assetThesis"
      sourceId={assetThesisId}
      sourceTitle={assetThesisTitle}
      targetType="strategy"
      autoLinkContext={{ assetThesisId, macroThesisId: macroThesisId || undefined }}
      onClose={onClose}
      existingItemsComponent={
        <ExistingEntityList<Strategy>
          entityType="strategy"
          onSelect={handleSelectStrategy}
          onCancel={onClose}
          renderItem={(strategy) => (
            <div className="space-y-1">
              <div className="font-medium text-slate-900">
                {strategy.label || strategy.strategyKey}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono text-slate-600">{strategy.strategyKey}</span>
                {strategy.direction && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs">
                    {strategy.direction}
                  </Badge>
                )}
                <Badge className="bg-slate-100 text-slate-700 text-xs">
                  {strategy.status}
                </Badge>
              </div>
            </div>
          )}
        />
      }
    />
  );
}
