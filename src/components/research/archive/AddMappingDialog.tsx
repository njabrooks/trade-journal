'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface AddMappingDialogProps {
  researchInsightId: string;
  onMappingCreated?: () => void;
}

interface HierarchyItem {
  id: string;
  name: string;
  ticker?: string;
}

export function AddMappingDialog({ researchInsightId, onMappingCreated }: AddMappingDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [hierarchyLevel, setHierarchyLevel] = useState<string>('macro_thesis');
  const [targetId, setTargetId] = useState<string>('');
  const [mappingType, setMappingType] = useState<string>('supports');
  const [confidence, setConfidence] = useState<string>('medium');
  const [notes, setNotes] = useState<string>('');

  // Hierarchy options
  const [theses, setTheses] = useState<HierarchyItem[]>([]);
  const [assetViews, setAssetViews] = useState<HierarchyItem[]>([]);
  const [strategies, setStrategies] = useState<HierarchyItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch hierarchy items when dialog opens or level changes
  useEffect(() => {
    if (!isOpen) return;

    const fetchHierarchyItems = async () => {
      setLoading(true);
      try {
        if (hierarchyLevel === 'macro_thesis') {
          const response = await fetch('/api/theses');
          const data = await response.json();
          // API returns array directly, not wrapped in { theses: ... }
          const thesesList = Array.isArray(data) ? data : data.theses || [];
          setTheses(
            thesesList.map((t: any) => ({ id: t.id, name: t.title }))
          );
        } else if (hierarchyLevel === 'asset_view') {
          const response = await fetch('/api/asset-views');
          const data = await response.json();
          // API returns array directly, not wrapped in { views: ... }
          const viewsList = Array.isArray(data) ? data : data.views || [];
          setAssetViews(
            viewsList.map((v: any) => ({
              id: v.id,
              name: v.title,
              ticker: v.ticker, // ticker is directly on the view object from list query
            }))
          );
        } else if (hierarchyLevel === 'strategy') {
          const response = await fetch('/api/strategies');
          const data = await response.json();
          setStrategies(
            data.strategies?.map((s: any) => ({
              id: s.id,
              name: s.strategyName,
              ticker: s.ticker,
            })) || []
          );
        }
      } catch (err) {
        console.error('Error fetching hierarchy items:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHierarchyItems();
  }, [isOpen, hierarchyLevel]);

  // Get available target items based on selected hierarchy level
  const getTargetOptions = () => {
    if (hierarchyLevel === 'macro_thesis') return theses;
    if (hierarchyLevel === 'asset_view') return assetViews;
    if (hierarchyLevel === 'strategy') return strategies;
    return [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Prepare mapping data
      const mappingData: any = {
        researchInsightId,
        hierarchyLevel,
        mappingType,
        confidence,
        notes: notes.trim() || null,
        mappedBy: 'user',
      };

      // Set the appropriate target ID field
      if (hierarchyLevel === 'macro_thesis') {
        mappingData.macroThesisId = targetId;
      } else if (hierarchyLevel === 'asset_view') {
        mappingData.assetViewId = targetId;
      } else if (hierarchyLevel === 'strategy') {
        mappingData.strategyId = targetId;
      } else if (hierarchyLevel === 'position') {
        mappingData.positionId = targetId;
      }

      const response = await fetch('/api/research/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingData),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Failed to create mapping');
        return;
      }

      // Reset form
      setTargetId('');
      setNotes('');
      setIsOpen(false);

      // Notify parent
      onMappingCreated?.();
    } catch (err) {
      console.error('Error creating mapping:', err);
      setError('Failed to create mapping');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} variant="outline" size="sm">
        + Link to Hierarchy
      </Button>
    );
  }

  const targetOptions = getTargetOptions();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Link Research to Hierarchy</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hierarchy Level */}
          <div>
            <Label htmlFor="hierarchyLevel">Link To</Label>
            <select
              id="hierarchyLevel"
              value={hierarchyLevel}
              onChange={(e) => {
                setHierarchyLevel(e.target.value);
                setTargetId(''); // Reset target when level changes
              }}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="macro_thesis">Macro Thesis</option>
              <option value="asset_view">Asset View</option>
              <option value="strategy">Strategy</option>
            </select>
          </div>

          {/* Target Selection */}
          <div>
            <Label htmlFor="targetId">
              Select{' '}
              {hierarchyLevel === 'macro_thesis'
                ? 'Thesis'
                : hierarchyLevel === 'asset_view'
                  ? 'Asset View'
                  : 'Strategy'}
            </Label>
            {loading ? (
              <div className="text-sm text-gray-500 mt-1">Loading...</div>
            ) : (
              <select
                id="targetId"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                required
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">-- Select --</option>
                {targetOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.ticker ? `${item.ticker} - ${item.name}` : item.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Mapping Type */}
          <div>
            <Label htmlFor="mappingType">Evidence Type</Label>
            <select
              id="mappingType"
              value={mappingType}
              onChange={(e) => setMappingType(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="supports">Supports</option>
              <option value="refutes">Refutes</option>
              <option value="neutral">Neutral</option>
              <option value="exploratory">Exploratory</option>
            </select>
          </div>

          {/* Confidence */}
          <div>
            <Label htmlFor="confidence">Confidence</Label>
            <select
              id="confidence"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="exploratory">Exploratory</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Add context or notes about this evidence..."
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !targetId}>
              {isSubmitting ? 'Creating...' : 'Link Research'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
