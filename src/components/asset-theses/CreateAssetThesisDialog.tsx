'use client';

import { useRouter } from 'next/navigation';
import { X, Target } from 'lucide-react';
import { CreateAssetThesisForm } from '@/components/linking/CreateAssetThesisForm';

interface CreateAssetThesisDialogProps {
  onClose: () => void;
  prefilledMainClaimIds?: string[]; // Optional: pre-link main claims
  prefilledThesisIds?: string[]; // Optional: pre-link parent theses
}

export function CreateAssetThesisDialog({
  onClose,
  prefilledMainClaimIds = [],
  prefilledThesisIds = [],
}: CreateAssetThesisDialogProps) {
  const router = useRouter();

  const handleCreate = async (data: any) => {
    const response = await fetch('/api/asset-theses/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        linkedMainClaimIds: prefilledMainClaimIds,
        linkedThesisIds: prefilledThesisIds,
        primaryMacroThesisId: prefilledThesisIds[0] || undefined, // Link to first thesis if provided
        notes: {
          created_via: 'UI',
          created_at: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create asset thesis');
    }

    const result = await response.json();
    
    // Redirect to the new asset thesis page
    router.push(`/asset-theses/${result.viewId}`);
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">Create Asset Thesis</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content - Use unified form */}
        <div className="flex-1 overflow-y-auto">
          <CreateAssetThesisForm
            onSubmit={handleCreate}
            onCancel={onClose}
            autoGenTitle={true}
          />
        </div>

        {/* Pre-linked items badges */}
        {(prefilledMainClaimIds.length > 0 || prefilledThesisIds.length > 0) && (
          <div className="px-6 py-3 border-t border-slate-200 bg-purple-50 space-y-2">
            {prefilledMainClaimIds.length > 0 && (
              <p className="text-sm text-purple-900">
                <strong>Linked Claims:</strong> {prefilledMainClaimIds.length} main claim
                {prefilledMainClaimIds.length !== 1 ? 's' : ''} will be linked
              </p>
            )}
            {prefilledThesisIds.length > 0 && (
              <p className="text-sm text-purple-900">
                <strong>Linked Macro Theses:</strong> {prefilledThesisIds.length} macro thesis
                {prefilledThesisIds.length !== 1 ? 'es' : ''} will be linked
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
