'use client';

/**
 * ManageRelatedMacroThesesDialog - Manage related (non-primary) macro theses for an asset thesis
 * 
 * Sprint 2: Multi-Macro-Thesis Support
 * - View current related macro theses
 * - Add new related macro theses
 * - Remove existing related macro theses
 * - Edit relationship notes
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface RelatedMacroThesis {
  id: string;
  macroThesisId: string;
  title: string;
  relationshipNote?: string | null;
}

interface MacroThesisOption {
  id: string;
  title: string;
}

interface ManageRelatedMacroThesesDialogProps {
  assetThesisId: string;
  assetThesisTitle: string;
  primaryMacroThesisId?: string | null;
  currentRelated: RelatedMacroThesis[];
  isOpen: boolean;
  onClose: () => void;
}

export function ManageRelatedMacroThesesDialog({
  assetThesisId,
  assetThesisTitle,
  primaryMacroThesisId,
  currentRelated,
  isOpen,
  onClose,
}: ManageRelatedMacroThesesDialogProps) {
  const router = useRouter();
  const [availableTheses, setAvailableTheses] = useState<MacroThesisOption[]>([]);
  const [loadingTheses, setLoadingTheses] = useState(true);
  const [selectedThesisId, setSelectedThesisId] = useState<string>('');
  const [relationshipNote, setRelationshipNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch available macro theses
  useEffect(() => {
    if (!isOpen) return;

    const fetchTheses = async () => {
      try {
        const response = await fetch('/api/theses');
        if (!response.ok) throw new Error('Failed to fetch macro theses');
        const data = await response.json();
        
        // Filter out primary and already-linked related theses
        const currentIds = new Set([
          primaryMacroThesisId,
          ...currentRelated.map((r) => r.macroThesisId),
        ].filter(Boolean));
        
        const available = data.filter((t: any) => !currentIds.has(t.id) && t.status === 'active');
        setAvailableTheses(available);
      } catch (err) {
        console.error('Error fetching macro theses:', err);
        setError('Failed to load macro theses');
      } finally {
        setLoadingTheses(false);
      }
    };

    fetchTheses();
  }, [isOpen, primaryMacroThesisId, currentRelated]);

  const handleAdd = async () => {
    if (!selectedThesisId) return;

    setAdding(true);
    setError(null);

    try {
      const response = await fetch(`/api/asset-theses/${assetThesisId}/related-macro-theses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          macroThesisId: selectedThesisId,
          relationshipNote: relationshipNote.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add related macro thesis');
      }

      router.refresh();
      setSelectedThesisId('');
      setRelationshipNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add related macro thesis');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (relationId: string) => {
    setRemoving(relationId);
    setError(null);

    try {
      const response = await fetch(`/api/asset-theses/${assetThesisId}/related-macro-theses/${relationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove related macro thesis');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove related macro thesis');
      setRemoving(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Manage Related Macro Theses
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {assetThesisTitle}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Current Related Theses */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Current Related Macro Theses ({currentRelated.length})
            </h3>
            {currentRelated.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No related macro theses yet.</p>
            ) : (
              <div className="space-y-2">
                {currentRelated.map((related) => (
                  <div
                    key={related.id}
                    className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {related.title}
                      </div>
                      {related.relationshipNote && (
                        <div className="text-xs text-slate-600 mt-1">
                          {related.relationshipNote}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(related.id)}
                      disabled={removing === related.id}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                    >
                      {removing === related.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add New Related Thesis */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Add Related Macro Thesis
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Select Macro Thesis
                </label>
                {loadingTheses ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  </div>
                ) : availableTheses.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">
                    All available macro theses are already linked.
                  </p>
                ) : (
                  <select
                    value={selectedThesisId}
                    onChange={(e) => setSelectedThesisId(e.target.value)}
                    disabled={adding}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a thesis...</option>
                    {availableTheses.map((thesis) => (
                      <option key={thesis.id} value={thesis.id}>
                        {thesis.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedThesisId && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Relationship Note (Optional)
                  </label>
                  <Input
                    type="text"
                    value={relationshipNote}
                    onChange={(e) => setRelationshipNote(e.target.value)}
                    placeholder="e.g., Provides sector context, Supports timing"
                    disabled={adding}
                    className="text-sm"
                  />
                </div>
              )}

              {selectedThesisId && (
                <Button
                  onClick={handleAdd}
                  disabled={adding || !selectedThesisId}
                  className="w-full"
                >
                  {adding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Related Macro Thesis
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-slate-200">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

