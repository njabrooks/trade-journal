'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AssetThesis {
  id: string;
  title: string;
  ticker: string | null;
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
  const [assetTheses, setAssetTheses] = useState<AssetThesis[]>([]);
  const [selectedAssetThesisId, setSelectedAssetThesisId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAssetTheses();
    }
  }, [isOpen]);

  const loadAssetTheses = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/asset-theses');
      if (!response.ok) throw new Error('Failed to fetch asset theses');
      
      const data = await response.json();
      setAssetTheses(data || []);
    } catch (err) {
      console.error('Error loading asset theses:', err);
      setError(err instanceof Error ? err.message : 'Failed to load asset theses');
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedAssetThesisId) {
      setError('Please select an asset thesis');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/asset-theses/${selectedAssetThesisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          macroThesisId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to link asset thesis');
      }

      router.refresh();
      setSelectedAssetThesisId('');
      onClose();
    } catch (err) {
      console.error('Error linking asset thesis:', err);
      setError(err instanceof Error ? err.message : 'Failed to link asset thesis');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Link Asset Thesis
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              to {macroThesisTitle}
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
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
            </div>
          ) : error && !saving ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-4">
              {error}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select Asset Thesis
                </label>
                <select
                  value={selectedAssetThesisId}
                  onChange={(e) => setSelectedAssetThesisId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={saving}
                >
                  <option value="">-- Select an asset thesis --</option>
                  {assetTheses.map((thesis) => (
                    <option key={thesis.id} value={thesis.id}>
                      {thesis.title} {thesis.ticker ? `(${thesis.ticker})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {error && saving && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleLink}
            disabled={saving || !selectedAssetThesisId}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Linking...
              </>
            ) : (
              'Link Asset Thesis'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

