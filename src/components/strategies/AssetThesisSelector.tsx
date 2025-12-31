'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Search } from 'lucide-react';

interface AssetThesis {
  id: string;
  title: string;
  underlyingTicker: string | null;
  direction: string | null;
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;
  primaryMacroThesisId: string | null;
  primaryMacroThesisTitle: string | null;
}

interface AssetThesisSelectorProps {
  onSelect: (assetThesisId: string) => Promise<void>;
  onCancel: () => void;
  currentViewId?: string | null;
}

export function AssetThesisSelector({
  onSelect,
  onCancel,
  currentViewId,
}: AssetThesisSelectorProps) {
  const [views, setViews] = useState<AssetThesis[]>([]);
  const [filteredViews, setFilteredViews] = useState<AssetThesis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedViewId, setSelectedViewId] = useState<string | null>(currentViewId || null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [thesisFilter, setThesisFilter] = useState<string>('all');

  // Fetch views on mount
  useEffect(() => {
    fetchViews();
  }, []);

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
      filtered = filtered.filter((v) => v.primaryMacroThesisId !== null);
    } else if (thesisFilter === 'unlinked') {
      filtered = filtered.filter((v) => v.primaryMacroThesisId === null);
    }

    setFilteredViews(filtered);
  }, [views, searchQuery, directionFilter, statusFilter, thesisFilter]);

  const fetchViews = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/asset-theses');
      if (!response.ok) {
        throw new Error('Failed to fetch asset theses');
      }
      const data = await response.json();
      setViews(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching asset theses:', err);
      setError('Failed to load asset theses. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = async (viewId: string) => {
    setSelecting(viewId);
    setError(null);
    try {
      await onSelect(viewId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link');
      setSelecting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by title or ticker..."
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

      {/* Views List */}
      {error && !selecting ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      ) : filteredViews.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <p>No asset theses found matching your filters.</p>
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
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredViews.map((view) => (
            <div
              key={view.id}
              className={`flex items-start justify-between p-3 rounded-lg border-2 transition-all ${
                selectedViewId === view.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <button
                onClick={() => setSelectedViewId(view.id)}
                className="flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{view.title}</span>
                  {view.underlyingTicker && (
                    <span className="inline-flex px-1.5 py-0.5 text-xs font-mono bg-slate-100 text-slate-900 rounded">
                      {view.underlyingTicker}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                  {view.primaryMacroThesisTitle && (
                    <span className="text-xs text-slate-500">→ {view.primaryMacroThesisTitle}</span>
                  )}
                </div>
              </button>
              <Button
                size="sm"
                onClick={() => handleSelect(view.id)}
                disabled={selecting !== null || selectedViewId !== view.id}
                className="ml-3 shrink-0"
              >
                {selecting === view.id ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Linking...
                  </>
                ) : (
                  'Select'
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {error && selecting && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={selecting !== null}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

