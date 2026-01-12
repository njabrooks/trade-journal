'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { AssetThesis } from '@/db/schema';

interface EditAssetThesisDialogProps {
  thesis: AssetThesis;
  onClose: () => void;
}

export function EditAssetThesisDialog({ thesis, onClose }: EditAssetThesisDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [title, setTitle] = useState(thesis.title);
  const [description, setDescription] = useState(thesis.description || '');
  const [narrative, setNarrative] = useState(thesis.narrative || '');
  const [fundamentalContext, setFundamentalContext] = useState(thesis.fundamentalContext || '');
  const [positioningContext, setPositioningContext] = useState(thesis.positioningContext || '');
  const [regimeContext, setRegimeContext] = useState(thesis.regimeContext || '');
  const [timeHorizon, setTimeHorizon] = useState(thesis.timeHorizon || 'medium_term');
  const [confidenceLevel, setConfidenceLevel] = useState(thesis.confidenceLevel || 'medium');
  const [status, setStatus] = useState(thesis.status);
  const [direction, setDirection] = useState<'bullish' | 'bearish' | 'neutral'>(
    (thesis.direction as 'bullish' | 'bearish' | 'neutral') || 'neutral'
  );
  const [positionStartDate, setPositionStartDate] = useState(
    thesis.positionStartDate ? new Date(thesis.positionStartDate).toISOString().split('T')[0] : ''
  );
  const [positionEndDate, setPositionEndDate] = useState(
    thesis.positionEndDate ? new Date(thesis.positionEndDate).toISOString().split('T')[0] : ''
  );
  const [targetPrice, setTargetPrice] = useState(thesis.targetPrice?.toString() || '');
  const [entryReferencePrice, setEntryReferencePrice] = useState(thesis.entryReferencePrice?.toString() || '');
  const [outcome, setOutcome] = useState(thesis.outcome || '');
  const [outcomeNotes, setOutcomeNotes] = useState(thesis.outcomeNotes || '');
  const [actualPrice, setActualPrice] = useState(thesis.actualPrice?.toString() || '');

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/asset-theses/${thesis.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete asset thesis');
      }

      // Success! Navigate to asset theses list
      router.push('/asset-theses');
      router.refresh();
    } catch (err) {
      console.error('Error deleting asset thesis:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete asset thesis');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/asset-theses/${thesis.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          narrative,
          fundamentalContext,
          positioningContext,
          regimeContext,
          timeHorizon,
          confidenceLevel,
          status,
          direction,
          positionStartDate: positionStartDate || null,
          positionEndDate: positionEndDate || null,
          targetPrice: targetPrice ? parseFloat(targetPrice) : null,
          entryReferencePrice: entryReferencePrice ? parseFloat(entryReferencePrice) : null,
          outcome: outcome || null,
          outcomeNotes: outcomeNotes || null,
          actualPrice: actualPrice ? parseFloat(actualPrice) : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update asset thesis');
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-semibold">Edit Asset Thesis</h2>
            <p className="text-sm text-slate-500 mt-1">Update asset thesis metadata and information</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-2">
              Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Narrative */}
          <div>
            <label htmlFor="narrative" className="block text-sm font-medium text-slate-700 mb-2">
              Narrative
            </label>
            <textarea
              id="narrative"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Context Fields */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="fundamentalContext" className="block text-sm font-medium text-slate-700 mb-2">
                Fundamental Context
              </label>
              <textarea
                id="fundamentalContext"
                value={fundamentalContext}
                onChange={(e) => setFundamentalContext(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="positioningContext" className="block text-sm font-medium text-slate-700 mb-2">
                Positioning Context
              </label>
              <textarea
                id="positioningContext"
                value={positioningContext}
                onChange={(e) => setPositioningContext(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="regimeContext" className="block text-sm font-medium text-slate-700 mb-2">
                Regime Context
              </label>
              <textarea
                id="regimeContext"
                value={regimeContext}
                onChange={(e) => setRegimeContext(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Time Horizon */}
          <div>
            <label htmlFor="timeHorizon" className="block text-sm font-medium text-slate-700 mb-2">
              Time Horizon *
            </label>
            <select
              id="timeHorizon"
              value={timeHorizon}
              onChange={(e) => setTimeHorizon(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="long_term">Long Term</option>
              <option value="medium_term">Medium Term</option>
              <option value="short_term">Short Term</option>
            </select>
          </div>

          {/* Confidence Level */}
          <div>
            <label htmlFor="confidenceLevel" className="block text-sm font-medium text-slate-700 mb-2">
              Confidence Level *
            </label>
            <select
              id="confidenceLevel"
              value={confidenceLevel}
              onChange={(e) => setConfidenceLevel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="exploratory">Exploratory</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-2">
              Status *
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="active">Active</option>
              <option value="under_review">Under Review</option>
              <option value="retired">Retired</option>
              <option value="superseded">Superseded</option>
            </select>
          </div>

          {/* Direction */}
          <div>
            <label htmlFor="direction" className="block text-sm font-medium text-slate-700 mb-2">
              Direction
            </label>
            <select
              id="direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as typeof direction)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="neutral">Neutral (Observational)</option>
              <option value="bullish">Bullish (Positive)</option>
              <option value="bearish">Bearish (Negative)</option>
            </select>
          </div>

          {/* Position Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="positionStartDate" className="block text-sm font-medium text-slate-700 mb-2">
                Position Start Date
              </label>
              <input
                id="positionStartDate"
                type="date"
                value={positionStartDate}
                onChange={(e) => setPositionStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="positionEndDate" className="block text-sm font-medium text-slate-700 mb-2">
                Position End Date
              </label>
              <input
                id="positionEndDate"
                type="date"
                value={positionEndDate}
                onChange={(e) => setPositionEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Price Targets */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="targetPrice" className="block text-sm font-medium text-slate-700 mb-2">
                Target Price
              </label>
              <input
                id="targetPrice"
                type="number"
                step="0.01"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor="entryReferencePrice" className="block text-sm font-medium text-slate-700 mb-2">
                Entry Reference Price
              </label>
              <input
                id="entryReferencePrice"
                type="number"
                step="0.01"
                value={entryReferencePrice}
                onChange={(e) => setEntryReferencePrice(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Outcome */}
          <div>
            <label htmlFor="outcome" className="block text-sm font-medium text-slate-700 mb-2">
              Outcome
            </label>
            <select
              id="outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Not Set</option>
              <option value="validated">Validated</option>
              <option value="invalidated">Invalidated</option>
              <option value="partial">Partial</option>
              <option value="ongoing">Ongoing</option>
            </select>
          </div>

          {/* Outcome Notes */}
          <div>
            <label htmlFor="outcomeNotes" className="block text-sm font-medium text-slate-700 mb-2">
              Outcome Notes
            </label>
            <textarea
              id="outcomeNotes"
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Notes about the outcome or current status..."
            />
          </div>

          {/* Actual Price */}
          <div>
            <label htmlFor="actualPrice" className="block text-sm font-medium text-slate-700 mb-2">
              Actual Price (at outcome)
            </label>
            <input
              id="actualPrice"
              type="number"
              step="0.01"
              value={actualPrice}
              onChange={(e) => setActualPrice(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div>
              {!showDeleteConfirm ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={loading || deleting}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                >
                  Delete Asset Thesis
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600 font-medium">Are you sure?</span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading || deleting}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || deleting}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
