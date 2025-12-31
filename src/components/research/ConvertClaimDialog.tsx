'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { MainClaim } from '@/types/claims';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface ConvertClaimDialogProps {
  claim: MainClaim;
  insightId: string;
  onClose: () => void;
}

type ConversionType = 'macro_thesis' | 'asset_view';

export function ConvertClaimDialog({ claim, insightId, onClose }: ConvertClaimDialogProps) {
  const router = useRouter();
  const [conversionType, setConversionType] = useState<ConversionType>(
    claim.type === 'thesis_candidate' ? 'macro_thesis' : 'asset_view'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState(claim.claim);
  const [description, setDescription] = useState(
    `${claim.evidence}\n\n${claim.reasoning}\n\n${claim.backing}`.trim()
  );
  const [thesisType, setThesisType] = useState<'secular' | 'cyclical' | 'structural' | 'tactical'>(
    'secular'
  );
  const [ticker, setTicker] = useState(claim.relevant_tickers?.[0] || '');
  const [timeHorizon, setTimeHorizon] = useState(claim.time_horizon || 'medium_term');
  const [confidenceLevel, setConfidenceLevel] = useState(claim.qualifier);
  const [notes, setNotes] = useState(claim.rebuttal ? `Counter-arguments: ${claim.rebuttal}` : '');

  // NEW: Position structure fields
  const [direction, setDirection] = useState<'bullish' | 'bearish' | 'neutral'>('neutral');
  const [positionStartDate, setPositionStartDate] = useState('');
  const [positionEndDate, setPositionEndDate] = useState('');
  const [sectors, setSectors] = useState('');

  // NEW: Asset view specific fields
  const [targetPrice, setTargetPrice] = useState('');
  const [entryReferencePrice, setEntryReferencePrice] = useState('');

  // NEW: Relationship type for claim-to-thesis mapping
  const [relationshipType, setRelationshipType] = useState<'supports' | 'refutes' | 'foundation'>('supports');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/research/convert-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insightId,
          claimId: claim.id,
          conversionType,
          relationshipType,
          data: {
            title,
            description,
            thesisType: conversionType === 'macro_thesis' ? thesisType : undefined,
            ticker: conversionType === 'asset_view' ? ticker.toUpperCase() : undefined,
            timeHorizon,
            confidenceLevel,
            notes,
            // NEW: Position structure
            direction: direction || null,
            positionStartDate: positionStartDate || null,
            positionEndDate: positionEndDate || null,
            sectors: conversionType === 'macro_thesis' && sectors
              ? sectors.split(',').map(s => s.trim()).filter(Boolean)
              : undefined,
            // NEW: Asset view specific
            targetPrice: conversionType === 'asset_view' && targetPrice ? parseFloat(targetPrice) : null,
            entryReferencePrice: conversionType === 'asset_view' && entryReferencePrice ? parseFloat(entryReferencePrice) : null,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to convert claim');
      }

      const result = await response.json();

      // Navigate to the created thesis/view
      if (conversionType === 'macro_thesis') {
        router.push(`/macro-theses/${result.id}`);
      } else {
        router.push(`/asset-theses/${result.id}`);
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
            <h2 className="text-xl font-semibold">Convert Claim</h2>
            <p className="text-sm text-slate-500 mt-1">
              Convert this claim into a {conversionType.replace('_', ' ')}
            </p>
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
          {/* Conversion Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Conversion Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="macro_thesis"
                  checked={conversionType === 'macro_thesis'}
                  onChange={(e) => setConversionType(e.target.value as ConversionType)}
                  className="mr-2"
                />
                <span className="text-sm">Macro Thesis</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="asset_view"
                  checked={conversionType === 'asset_view'}
                  onChange={(e) => setConversionType(e.target.value as ConversionType)}
                  className="mr-2"
                />
                <span className="text-sm">Asset Thesis</span>
              </label>
            </div>
          </div>

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
              Description *
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Pre-filled with claim's evidence, reasoning, and backing
            </p>
          </div>

          {/* Thesis Type (for macro thesis) */}
          {conversionType === 'macro_thesis' && (
            <div>
              <label htmlFor="thesisType" className="block text-sm font-medium text-slate-700 mb-2">
                Thesis Type *
              </label>
              <select
                id="thesisType"
                value={thesisType}
                onChange={(e) =>
                  setThesisType(e.target.value as 'secular' | 'cyclical' | 'structural' | 'tactical')
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="secular">Secular (Long-term structural shifts, 5-20 years)</option>
                <option value="cyclical">Cyclical (Business cycle related, 1-5 years)</option>
                <option value="structural">Structural (Market structure changes, 3-10 years)</option>
                <option value="tactical">Tactical (Short-term opportunities, &lt;1 year)</option>
              </select>
            </div>
          )}

          {/* Ticker (for asset thesis) */}
          {conversionType === 'asset_view' && (
            <div>
              <label htmlFor="ticker" className="block text-sm font-medium text-slate-700 mb-2">
                Ticker *
              </label>
              <input
                id="ticker"
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="NVDA"
                required
              />
            </div>
          )}

          {/* Time Horizon */}
          <div>
            <label htmlFor="timeHorizon" className="block text-sm font-medium text-slate-700 mb-2">
              Time Horizon *
            </label>
            <select
              id="timeHorizon"
              value={timeHorizon}
              onChange={(e) => setTimeHorizon(e.target.value as typeof timeHorizon)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="long_term">Long Term</option>
              <option value="medium_term">Medium Term</option>
              <option value="short_term">Short Term</option>
            </select>
          </div>

          {/* Confidence Level */}
          <div>
            <label
              htmlFor="confidenceLevel"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Confidence Level *
            </label>
            <select
              id="confidenceLevel"
              value={confidenceLevel}
              onChange={(e) => setConfidenceLevel(e.target.value as typeof confidenceLevel)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="exploratory">Exploratory</option>
            </select>
          </div>

          {/* NEW: Direction */}
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
            <p className="text-xs text-slate-500 mt-1">
              Your directional stance on this {conversionType === 'macro_thesis' ? 'theme' : 'asset'}
            </p>
          </div>

          {/* NEW: Position Dates */}
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

          {/* NEW: Sectors (for macro thesis) */}
          {conversionType === 'macro_thesis' && (
            <div>
              <label htmlFor="sectors" className="block text-sm font-medium text-slate-700 mb-2">
                Sectors
              </label>
              <input
                id="sectors"
                type="text"
                value={sectors}
                onChange={(e) => setSectors(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., AI hyperscalers, crypto alts, energy infrastructure"
              />
              <p className="text-xs text-slate-500 mt-1">
                Comma-separated list of sectors this thesis applies to
              </p>
            </div>
          )}

          {/* NEW: Price Targets (for asset thesis) */}
          {conversionType === 'asset_view' && (
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
          )}

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-2">
              Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Additional context, risks, or observations..."
            />
          </div>

          {/* Relationship Type */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <label htmlFor="relationshipType" className="block text-sm font-medium text-slate-700 mb-2">
              Claim Relationship to {conversionType === 'macro_thesis' ? 'Thesis' : 'Asset Thesis'} *
            </label>
            <select
              id="relationshipType"
              value={relationshipType}
              onChange={(e) => setRelationshipType(e.target.value as typeof relationshipType)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="supports">Supports - This claim provides evidence for the {conversionType === 'macro_thesis' ? 'thesis' : 'asset thesis'}</option>
              <option value="refutes">Refutes - This claim contradicts or challenges the {conversionType === 'macro_thesis' ? 'thesis' : 'asset thesis'}</option>
              <option value="foundation">Foundation - This claim is the foundational reasoning for the {conversionType === 'macro_thesis' ? 'thesis' : 'asset thesis'}</option>
            </select>
            <p className="text-xs text-slate-600 mt-2">
              After conversion, the original claim will be linked to the newly created {conversionType === 'macro_thesis' ? 'thesis' : 'asset thesis'} with this relationship.
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Converting...' : `Convert to ${conversionType.replace('_', ' ')}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
