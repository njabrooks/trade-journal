'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateMacroThesisForm } from './CreateMacroThesisForm';
import { CreateAssetThesisForm } from './CreateAssetThesisForm';
import { useRouter } from 'next/navigation';

type SourceType = 'claim' | 'strategy' | 'assetThesis' | 'macroThesis';
type TargetType = 'macroThesis' | 'assetThesis' | 'strategy';

interface UnifiedLinkingDialogProps {
  // What we're linking FROM
  sourceType: SourceType;
  sourceId: string;
  sourceTitle: string;
  
  // What we're linking TO
  targetType: TargetType;
  
  // Existing items component
  existingItemsComponent: React.ReactNode;
  
  // Auto-link context
  autoLinkContext?: {
    macroThesisId?: string;
    assetThesisId?: string;
  };
  
  // Callbacks
  onClose: () => void;
}

export function UnifiedLinkingDialog({
  sourceType,
  sourceId,
  sourceTitle,
  targetType,
  existingItemsComponent,
  autoLinkContext,
  onClose,
}: UnifiedLinkingDialogProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'existing' | 'new'>('existing');

  const getDialogTitle = () => {
    const sourceLabel = sourceType === 'assetThesis' ? 'Asset Thesis' : 
                       sourceType === 'macroThesis' ? 'Macro Thesis' :
                       sourceType === 'strategy' ? 'Strategy' : 'Claim';
    
    const targetLabel = targetType === 'macroThesis' ? 'Macro Thesis' :
                       targetType === 'assetThesis' ? 'Asset Thesis' : 'Strategy';
    
    return `Link ${sourceLabel} to ${targetLabel}`;
  };

  const handleCreateMacroThesis = async (data: any) => {
    try {
      // Create the macro thesis
      const response = await fetch('/api/theses/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create macro thesis');
      }

      const newThesis = await response.json();

      // Now link the source to the new macro thesis
      if (sourceType === 'assetThesis') {
        const linkResponse = await fetch(`/api/asset-theses/${sourceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ macroThesisId: newThesis.id }),
        });
        
        if (!linkResponse.ok) {
          throw new Error('Created thesis but failed to link');
        }
      }

      router.refresh();
      onClose();
    } catch (error) {
      throw error; // Let form handle the error
    }
  };

  const handleCreateAssetThesis = async (data: any) => {
    try {
      // Add auto-link context
      const createData = {
        ...data,
        macroThesisId: autoLinkContext?.macroThesisId || data.macroThesisId,
      };

      // Create the asset thesis
      const response = await fetch('/api/asset-theses/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create asset thesis');
      }

      const newThesis = await response.json();

      // Now link the source to the new asset thesis
      if (sourceType === 'strategy') {
        const linkResponse = await fetch(`/api/strategies/${sourceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetThesisId: newThesis.id,
            macroThesisId: autoLinkContext?.macroThesisId || newThesis.macroThesisId,
          }),
        });
        
        if (!linkResponse.ok) {
          throw new Error('Created thesis but failed to link');
        }
      } else if (sourceType === 'macroThesis') {
        // Link was already done via macroThesisId in create
      }

      router.refresh();
      onClose();
    } catch (error) {
      throw error; // Let form handle the error
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {getDialogTitle()}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {sourceTitle}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('existing')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'existing'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Link to Existing
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'new'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Create New & Link
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'existing' ? (
            existingItemsComponent
          ) : (
            <div>
              {targetType === 'macroThesis' && (
                <CreateMacroThesisForm
                  onSubmit={handleCreateMacroThesis}
                  onCancel={onClose}
                  autoGenTitle={true}
                />
              )}
              {targetType === 'assetThesis' && (
                <CreateAssetThesisForm
                  onSubmit={handleCreateAssetThesis}
                  onCancel={onClose}
                  autoGenTitle={true}
                  macroThesisId={autoLinkContext?.macroThesisId}
                />
              )}
              {targetType === 'strategy' && (
                <div className="text-center py-8 text-slate-500">
                  Strategy creation form coming soon
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

