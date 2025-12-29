'use client';

/**
 * LinkToViewDialog - Dialog for linking Strategies to Asset Thesiss
 *
 * Provides search and filter UI to select an asset thesis and link it
 * to the current strategy via API call.
 *
 * Part of Phase 2.6.6 Phase B: Inline Linking Workflows
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AssetThesis {
  id: string;
  title: string;
  underlyingTicker: string | null;
  direction: string | null;
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;
  macroThesisId: string | null;
  macroThesisTitle: string | null;
}

interface LinkToViewDialogProps {
  strategyId: string;
  strategyLabel: string;
  isOpen: boolean;
  onClose: () => void;
  currentViewId?: string | null;
  currentThesisId?: string | null;
}

export function LinkToViewDialog({
  strategyId,
  strategyLabel,
  isOpen,
  onClose,
  currentViewId,
  currentThesisId,
}: LinkToViewDialogProps) {
  const router = useRouter();
  const [views, setViews] = useState<AssetThesis[]>([]);
  const [filteredViews, setFilteredViews] = useState<AssetThesis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedViewId, setSelectedViewId] = useState<string | null>(currentViewId || null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [thesisFilter, setThesisFilter] = useState<string>('all');

  // Fetch views when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchViews();
    }
  }, [isOpen]);

  // Apply filters
  useEffect(() => {
    let filtered = [...views];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.title.toLowerCase().includes(query) ||
          v.underlyingTicker?.toLowerCase().includes(query)
      );
    }

    // Direction filter
    if (directionFilter !== 'all') {
      filtered = filtered.filter((v) => v.direction === directionFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((v) => v.status === statusFilter);
    }

    // Thesis filter
    if (thesisFilter === 'linked') {
      filtered = filtered.filter((v) => v.macroThesisId !== null);
    } else if (thesisFilter === 'unlinked') {
      filtered = filtered.filter((v) => v.macroThesisId === null);
    }

    setFilteredViews(filtered);
  }, [views, searchQuery, directionFilter, statusFilter, thesisFilter]);

  const fetchViews = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/asset-views');
      if (!response.ok) {
        throw new Error('Failed to fetch asset thesiss');
      }
      const data = await response.json();
      setViews(data.views || []);
    } catch (err) {
      console.error('Error fetching views:', err);
      setError('Failed to load asset thesiss. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedViewId) {
      setError('Please select an asset thesis');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Get the selected view to also link its macro thesis if it has one
      const selectedView = views.find((v) => v.id === selectedViewId);

      const response = await fetch(`/api/strategies/${strategyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_thesis_id: selectedViewId,
          // Also link the macro thesis if the selected view has one
          macro_thesis_id: selectedView?.macroThesisId || currentThesisId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to link asset thesis');
      }

      // Success! Refresh the page to show the new link
      router.refresh();
      onClose();
    } catch (err) {
      console.error('Error linking view:', err);
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-semibold">Link to Asset Thesis</h2>
            <p className="text-sm text-slate-600 mt-1">
              Select an asset thesis to link to <span className="font-medium">{strategyLabel}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            disabled={isSaving}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-6 border-b border-slate-200 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search views by title or ticker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Direction</label>
              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              >
                <option value="all">All Directions</option>
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="under_review">Under Review</option>
                <option value="retired">Retired</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Macro Thesis</label>
              <select
                value={thesisFilter}
                onChange={(e) => setThesisFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              >
                <option value="all">All</option>
                <option value="linked">With Thesis</option>
                <option value="unlinked">Without Thesis</option>
              </select>
            </div>
          </div>
        </div>

        {/* Views List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
            </div>
          ) : error && !isSaving ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              {error}
            </div>
          ) : filteredViews.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p>No asset thesiss found matching your filters.</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setDirectionFilter('all');
                  setStatusFilter('active');
                  setThesisFilter('all');
                }}
                className="text-blue-600 hover:text-blue-800 text-sm mt-2"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredViews.map((view) => (
                <button
                  key={view.id}
                  onClick={() => setSelectedViewId(view.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedViewId === view.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 truncate">{view.title}</span>
                        {view.underlyingTicker && (
                          <span className="inline-flex px-1.5 py-0.5 text-xs font-mono bg-slate-100 text-slate-900 rounded">
                            {view.underlyingTicker}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {view.direction && (
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                              view.direction === 'bullish'
                                ? 'bg-emerald-100 text-emerald-700'
                                : view.direction === 'bearish'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {view.direction}
                          </span>
                        )}
                        {view.confidenceLevel && (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                            {view.confidenceLevel}
                          </span>
                        )}
                        {view.macroThesisTitle && (
                          <span className="text-xs text-slate-500">→ {view.macroThesisTitle}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200 bg-slate-50">
          {error && isSaving && (
            <div className="text-sm text-red-600">{error}</div>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <Button variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleLink} disabled={!selectedViewId || isSaving}>
              {isSaving ? (
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
    </div>
  );
}
