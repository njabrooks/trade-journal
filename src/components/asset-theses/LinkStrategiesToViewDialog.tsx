'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Strategy {
  id: string;
  label: string;
  strategyKey: string;
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
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadStrategies();
    }
  }, [isOpen]);

  const loadStrategies = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/strategies');
      if (!response.ok) throw new Error('Failed to fetch strategies');
      
      const data = await response.json();
      setStrategies(data.strategies || []);
    } catch (err) {
      console.error('Error loading strategies:', err);
      setError(err instanceof Error ? err.message : 'Failed to load strategies');
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedStrategyId) {
      setError('Please select a strategy');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/strategies/${selectedStrategyId}`, {
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
      setSelectedStrategyId('');
      onClose();
    } catch (err) {
      console.error('Error linking strategy:', err);
      setError(err instanceof Error ? err.message : 'Failed to link strategy');
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
              Link Strategy
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              to {assetThesisTitle}
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
                  Select Strategy
                </label>
                <select
                  value={selectedStrategyId}
                  onChange={(e) => setSelectedStrategyId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={saving}
                >
                  <option value="">-- Select a strategy --</option>
                  {strategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.label || strategy.strategyKey}
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
            disabled={saving || !selectedStrategyId}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Linking...
              </>
            ) : (
              'Link Strategy'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

