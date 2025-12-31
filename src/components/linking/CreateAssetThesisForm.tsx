'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface CreateAssetThesisFormData {
  title?: string;
  description?: string;
  ticker: string; // API expects ticker, not underlyingId
  direction: 'bullish' | 'bearish' | 'neutral';
  timeHorizon: 'long_term' | 'medium_term' | 'short_term';
  confidenceLevel: 'high' | 'medium' | 'low' | 'exploratory';
  status: 'active' | 'under_review' | 'retired';
  macroThesisId?: string;
}

interface Underlying {
  id: string;
  ticker: string;
  name: string;
}

interface CreateAssetThesisFormProps {
  onSubmit: (data: CreateAssetThesisFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<CreateAssetThesisFormData>;
  autoGenTitle?: boolean;
  macroThesisId?: string; // Auto-link to this macro thesis
}

export function CreateAssetThesisForm({
  onSubmit,
  onCancel,
  initialData = {},
  autoGenTitle = true,
  macroThesisId,
}: CreateAssetThesisFormProps) {
  const [formData, setFormData] = useState<CreateAssetThesisFormData>({
    direction: initialData.direction || 'bullish',
    timeHorizon: initialData.timeHorizon || 'medium_term',
    confidenceLevel: initialData.confidenceLevel || 'medium',
    status: initialData.status || 'active',
    ticker: '', // Will be set when underlying is selected
    primaryMacroThesisId: macroThesisId || initialData.primaryMacroThesisId,
    title: initialData.title,
    description: initialData.description,
  });

  const [underlyings, setUnderlyings] = useState<Underlying[]>([]);
  const [selectedUnderlyingId, setSelectedUnderlyingId] = useState<string>('');
  const [loadingUnderlyings, setLoadingUnderlyings] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch underlyings
  useEffect(() => {
    const fetchUnderlyings = async () => {
      try {
        const response = await fetch('/api/underlyings');
        if (!response.ok) throw new Error('Failed to fetch underlyings');
        const data = await response.json();
        setUnderlyings(data || []);
      } catch (err) {
        console.error('Error fetching underlyings:', err);
        setError('Failed to load underlyings');
      } finally {
        setLoadingUnderlyings(false);
      }
    };
    fetchUnderlyings();
  }, []);

  const selectedUnderlying = underlyings.find((u) => u.id === selectedUnderlyingId);

  const handleUnderlyingChange = (underlyingId: string) => {
    setSelectedUnderlyingId(underlyingId);
    const underlying = underlyings.find((u) => u.id === underlyingId);
    if (underlying) {
      setFormData({ ...formData, ticker: underlying.ticker });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!autoGenTitle && !formData.title?.trim()) {
      setError('Title is required');
      return;
    }

    if (!formData.ticker) {
      setError('Underlying is required');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create asset thesis');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Title (optional if auto-generated) */}
      {!autoGenTitle && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Bullish AAPL Medium Term"
            required={!autoGenTitle}
            disabled={loading}
          />
        </div>
      )}

      {autoGenTitle && selectedUnderlying && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <strong>Note:</strong> Title will be auto-generated as: {formData.direction} {selectedUnderlying.ticker} {formData.timeHorizon.replace('_', ' ')}
        </div>
      )}

      {/* Underlying */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Underlying <span className="text-red-500">*</span>
        </label>
        <select
          value={selectedUnderlyingId}
          onChange={(e) => handleUnderlyingChange(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
          disabled={loading || loadingUnderlyings}
        >
          <option value="">-- Select an underlying --</option>
          {underlyings.map((underlying) => (
            <option key={underlying.id} value={underlying.id}>
              {underlying.ticker} - {underlying.name}
            </option>
          ))}
        </select>
        {loadingUnderlyings && (
          <p className="text-xs text-slate-500 mt-1">Loading underlyings...</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Direction */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Direction <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.direction}
            onChange={(e) => setFormData({ ...formData, direction: e.target.value as any })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={loading}
          >
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>

        {/* Time Horizon */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Time Horizon <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.timeHorizon}
            onChange={(e) => setFormData({ ...formData, timeHorizon: e.target.value as any })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={loading}
          >
            <option value="long_term">Long Term</option>
            <option value="medium_term">Medium Term</option>
            <option value="short_term">Short Term</option>
          </select>
        </div>

        {/* Confidence Level */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Confidence <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.confidenceLevel}
            onChange={(e) => setFormData({ ...formData, confidenceLevel: e.target.value as any })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={loading}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="exploratory">Exploratory</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Status <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={loading}
          >
            <option value="active">Active</option>
            <option value="under_review">Under Review</option>
            <option value="retired">Retired</option>
          </select>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Description (optional)
        </label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="Brief description of the asset thesis..."
          disabled={loading}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading || loadingUnderlyings}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            'Create & Link'
          )}
        </Button>
      </div>
    </form>
  );
}

