'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Target, AlertCircle, CheckCircle } from 'lucide-react';

interface CreateAssetViewDialogProps {
  onClose: () => void;
  prefilledMainClaimIds?: string[]; // Optional: pre-link main claims
  prefilledThesisIds?: string[]; // Optional: pre-link parent theses
}

export function CreateAssetViewDialog({
  onClose,
  prefilledMainClaimIds = [],
  prefilledThesisIds = [],
}: CreateAssetViewDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [ticker, setTicker] = useState('');
  const [description, setDescription] = useState('');
  const [viewType, setViewType] = useState<'long' | 'short' | 'neutral'>('long');
  const [timeHorizon, setTimeHorizon] = useState<'long_term' | 'medium_term' | 'short_term'>('medium_term');
  const [confidenceLevel, setConfidenceLevel] = useState<'high' | 'medium' | 'low' | 'exploratory'>('medium');
  const [direction, setDirection] = useState<'bullish' | 'bearish' | 'neutral'>('bullish');
  const [targetPrice, setTargetPrice] = useState('');
  const [positionStartDate, setPositionStartDate] = useState('');
  const [positionEndDate, setPositionEndDate] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!ticker.trim()) {
      setError('Ticker is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/asset-views/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          ticker: ticker.trim().toUpperCase(),
          description: description.trim() || undefined,
          viewType,
          timeHorizon,
          confidenceLevel,
          status: 'active',
          direction,
          targetPrice: targetPrice.trim() || undefined,
          positionStartDate: positionStartDate || undefined,
          positionEndDate: positionEndDate || undefined,
          linkedMainClaimIds: prefilledMainClaimIds,
          linkedThesisIds: prefilledThesisIds,
          notes: {
            created_via: 'UI',
            created_at: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create asset view');
      }

      const result = await response.json();
      setSuccess(true);

      // Redirect to the new asset view page
      setTimeout(() => {
        router.push(`/asset-views/${result.viewId}`);
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-900">Create Asset View</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            disabled={loading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Success State */}
          {success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-900">
                  Asset view created successfully! Redirecting...
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <p className="text-sm text-red-900">{error}</p>
              </div>
            </div>
          )}

          {/* Form Fields */}
          {!success && (
            <>
              {/* Row: Title, Ticker */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Cisco Long: On-Premise AI Networking"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Ticker <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    placeholder="CSCO"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the asset view..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={loading}
                />
              </div>

              {/* Row: View Type, Horizon, Confidence */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    View Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={viewType}
                    onChange={(e) => setViewType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={loading}
                  >
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                    <option value="neutral">Neutral</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Time Horizon
                  </label>
                  <select
                    value={timeHorizon}
                    onChange={(e) => setTimeHorizon(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={loading}
                  >
                    <option value="short_term">Short Term</option>
                    <option value="medium_term">Medium Term</option>
                    <option value="long_term">Long Term</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Confidence
                  </label>
                  <select
                    value={confidenceLevel}
                    onChange={(e) => setConfidenceLevel(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={loading}
                  >
                    <option value="exploratory">Exploratory</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              {/* Row: Direction, Target Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Direction
                  </label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={loading}
                  >
                    <option value="neutral">Neutral</option>
                    <option value="bullish">Bullish</option>
                    <option value="bearish">Bearish</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Target Price (optional)
                  </label>
                  <input
                    type="text"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="65.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Row: Position Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Position Start Date
                  </label>
                  <input
                    type="date"
                    value={positionStartDate}
                    onChange={(e) => setPositionStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Position End Date
                  </label>
                  <input
                    type="date"
                    value={positionEndDate}
                    onChange={(e) => setPositionEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Pre-linked Entities Badges */}
              {(prefilledMainClaimIds.length > 0 || prefilledThesisIds.length > 0) && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                  {prefilledMainClaimIds.length > 0 && (
                    <p className="text-sm text-purple-900">
                      <strong>Linked Claims:</strong> {prefilledMainClaimIds.length} main claim
                      {prefilledMainClaimIds.length !== 1 ? 's' : ''}
                    </p>
                  )}
                  {prefilledThesisIds.length > 0 && (
                    <p className="text-sm text-purple-900">
                      <strong>Parent Theses:</strong> {prefilledThesisIds.length} thesis
                      {prefilledThesisIds.length !== 1 ? 'es' : ''}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating...' : 'Create Asset View'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
