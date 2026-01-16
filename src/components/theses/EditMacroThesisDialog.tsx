'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import type { MacroThesis } from '@/db/schema';
import { 
  getAllTaxonomyItems, 
  searchTaxonomy,
  type TaxonomyItem 
} from '@/lib/constants/sector-taxonomy';

interface EditMacroThesisDialogProps {
  thesis: MacroThesis;
  onClose: () => void;
}

export function EditMacroThesisDialog({ thesis, onClose }: EditMacroThesisDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [title, setTitle] = useState(thesis.title);
  const [description, setDescription] = useState(thesis.description || '');
  const [thesisType, setThesisType] = useState<'secular' | 'cyclical' | 'structural' | 'tactical'>(
    thesis.thesisType as 'secular' | 'cyclical' | 'structural' | 'tactical'
  );
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
  const [sectors, setSectors] = useState<string[]>(thesis.sectors || []);
  const [sectorSearch, setSectorSearch] = useState('');
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  const [outcome, setOutcome] = useState(thesis.outcome || '');
  const [outcomeNotes, setOutcomeNotes] = useState(thesis.outcomeNotes || '');

  // Get filtered taxonomy items
  const filteredTaxonomyItems = sectorSearch 
    ? searchTaxonomy(sectorSearch) 
    : getAllTaxonomyItems().slice(0, 20);

  const handleAddSector = (item: TaxonomyItem) => {
    if (!sectors.includes(item.value)) {
      setSectors([...sectors, item.value]);
    }
    setSectorSearch('');
    setShowSectorDropdown(false);
  };

  const handleRemoveSector = (sectorValue: string) => {
    setSectors(sectors.filter((s) => s !== sectorValue));
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/theses/${thesis.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete thesis');
      }

      // Success! Navigate to theses list
      router.push('/macro-theses');
      router.refresh();
    } catch (err) {
      console.error('Error deleting thesis:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete thesis');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/theses/${thesis.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          thesisType,
          timeHorizon,
          confidenceLevel,
          status,
          direction,
          positionStartDate: positionStartDate || null,
          positionEndDate: positionEndDate || null,
          sectors: sectors,
          outcome: outcome || null,
          outcomeNotes: outcomeNotes || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update thesis');
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
            <h2 className="text-xl font-semibold">Edit Macro Thesis</h2>
            <p className="text-sm text-slate-500 mt-1">Update thesis metadata and information</p>
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

          {/* Thesis Type */}
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
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="complete">Complete</option>
              <option value="rejected">Rejected</option>
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

          {/* Sectors */}
          <div>
            <label htmlFor="sectors" className="block text-sm font-medium text-slate-700 mb-2">
              Sectors / Topics
            </label>
            <div className="relative">
              <input
                id="sectors"
                type="text"
                value={sectorSearch}
                onChange={(e) => {
                  setSectorSearch(e.target.value);
                  setShowSectorDropdown(true);
                }}
                onFocus={() => setShowSectorDropdown(true)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search sectors, industries, regions..."
                disabled={loading}
              />
              {showSectorDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
                  {filteredTaxonomyItems.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500">No matches found</div>
                  ) : (
                    filteredTaxonomyItems.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => handleAddSector(item)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        disabled={sectors.includes(item.value)}
                      >
                        <div className="font-medium text-sm text-slate-900">{item.label}</div>
                        {item.description && (
                          <div className="text-xs text-slate-500">{item.description}</div>
                        )}
                        {sectors.includes(item.value) && (
                          <Badge className="mt-1 bg-green-100 text-green-700 text-xs">Selected</Badge>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected sectors */}
            {sectors.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {sectors.map((sectorValue) => {
                  const item = getAllTaxonomyItems().find(i => i.value === sectorValue);
                  return (
                    <Badge
                      key={sectorValue}
                      variant="secondary"
                      className="pl-2 pr-1 py-1 text-xs"
                    >
                      {item?.label || sectorValue}
                      <button
                        type="button"
                        onClick={() => handleRemoveSector(sectorValue)}
                        className="ml-1 hover:bg-slate-300 rounded-full p-0.5"
                        disabled={loading}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Search and select from structured taxonomy
            </p>
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
                  Delete Thesis
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
