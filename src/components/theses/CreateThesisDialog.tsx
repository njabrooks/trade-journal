'use client';

import { useRouter } from 'next/navigation';
import { X, TrendingUp } from 'lucide-react';
import { CreateMacroThesisForm } from '@/components/linking/CreateMacroThesisForm';

interface CreateThesisDialogProps {
  onClose: () => void;
  prefilledMainClaimIds?: string[]; // Optional: pre-link main claims
}

export function CreateThesisDialog({ onClose, prefilledMainClaimIds = [] }: CreateThesisDialogProps) {
  const router = useRouter();

  const handleCreate = async (data: any) => {
    const response = await fetch('/api/theses/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        title: data.title || `${data.direction} ${data.sectors[0]?.replace('Sector - ', '').replace('Theme - ', '')} ${data.timeHorizon.replace('_', ' ')}`,
        linkedMainClaimIds: prefilledMainClaimIds,
        notes: {
          created_via: 'UI',
          created_at: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create macro thesis');
    }

    const result = await response.json();
    
    // Redirect to the new thesis page
    router.push(`/macro-theses/${result.thesisId}`);
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-foreground">Create Macro Thesis</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content - Use unified form */}
        <div className="flex-1 overflow-y-auto">
          <CreateMacroThesisForm
            onSubmit={handleCreate}
            onCancel={onClose}
            autoGenTitle={true}
          />
        </div>

        {/* Pre-linked Claims Badge */}
        {prefilledMainClaimIds.length > 0 && (
          <div className="px-6 py-3 border-t border bg-violet-500/10">
            <p className="text-sm text-foreground">
              <strong>Linked Claims:</strong> {prefilledMainClaimIds.length} main claim
              {prefilledMainClaimIds.length !== 1 ? 's' : ''} will be linked to this thesis
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
