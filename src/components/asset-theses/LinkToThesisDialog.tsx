'use client';

/**
 * LinkToThesisDialog - Dialog for linking Asset Thesiss to Macro Theses
 *
 * Provides search and filter UI to select a macro thesis and link it
 * to the current asset thesis via API call.
 *
 * Part of Phase 2.6.6 Phase B: Inline Linking Workflows
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MacroThesis {
  id: string;
  title: string;
  thesisType: string;
  direction: string | null;
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;
  sectors: string[] | null;
}

interface LinkToThesisDialogProps {
  viewId: string;
  viewTitle: string;
  isOpen: boolean;
  onClose: () => void;
  currentThesisId?: string | null;
}

export function LinkToThesisDialog({
  viewId,
  viewTitle,
  isOpen,
  onClose,
  currentThesisId,
}: LinkToThesisDialogProps) {
  const router = useRouter();
  const [theses, setTheses] = useState<MacroThesis[]>([]);
  const [filteredTheses, setFilteredTheses] = useState<MacroThesis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThesisId, setSelectedThesisId] = useState<string | null>(currentThesisId || null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [thesisTypeFilter, setThesisTypeFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');

  // Fetch theses when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchTheses();
    }
  }, [isOpen]);

  // Apply filters
  useEffect(() => {
    let filtered = [...theses];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.sectors?.some((s) => s.toLowerCase().includes(query))
      );
    }

    // Thesis type filter
    if (thesisTypeFilter !== 'all') {
      filtered = filtered.filter((t) => t.thesisType === thesisTypeFilter);
    }

    // Direction filter
    if (directionFilter !== 'all') {
      filtered = filtered.filter((t) => t.direction === directionFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }

    setFilteredTheses(filtered);
  }, [theses, searchQuery, thesisTypeFilter, directionFilter, statusFilter]);

  const fetchTheses = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/theses');
      if (!response.ok) {
        throw new Error('Failed to fetch macro theses');
      }
      const data = await response.json();
      // API returns array directly, not wrapped in { theses: [] }
      setTheses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching theses:', err);
      setError('Failed to load macro theses. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedThesisId) {
      setError('Please select a macro thesis');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/asset-theses/${viewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          macro_thesis_id: selectedThesisId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to link macro thesis');
      }

      // Success! Refresh the page to show the new link
      router.refresh();
      onClose();
    } catch (err) {
      console.error('Error linking thesis:', err);
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
            <h2 className="text-xl font-semibold">Link to Macro Thesis</h2>
            <p className="text-sm text-slate-600 mt-1">
              Select a macro thesis to link to <span className="font-medium">{viewTitle}</span>
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
              placeholder="Search theses by title or sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Thesis Type</label>
              <select
                value={thesisTypeFilter}
                onChange={(e) => setThesisTypeFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              >
                <option value="all">All Types</option>
                <option value="secular">Secular</option>
                <option value="cyclical">Cyclical</option>
                <option value="structural">Structural</option>
              </select>
            </div>

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
          </div>
        </div>

        {/* Thesis List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
            </div>
          ) : error && !isSaving ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              {error}
            </div>
          ) : filteredTheses.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p>No macro theses found matching your filters.</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setThesisTypeFilter('all');
                  setDirectionFilter('all');
                  setStatusFilter('active');
                }}
                className="text-blue-600 hover:text-blue-800 text-sm mt-2"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTheses.map((thesis) => (
                <button
                  key={thesis.id}
                  onClick={() => setSelectedThesisId(thesis.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedThesisId === thesis.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate">{thesis.title}</div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                          {thesis.thesisType}
                        </span>
                        {thesis.direction && (
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                              thesis.direction === 'bullish'
                                ? 'bg-emerald-100 text-emerald-700'
                                : thesis.direction === 'bearish'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {thesis.direction}
                          </span>
                        )}
                        {thesis.confidenceLevel && (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                            {thesis.confidenceLevel} confidence
                          </span>
                        )}
                        {thesis.sectors && thesis.sectors.length > 0 && (
                          <span className="text-xs text-slate-500">
                            {thesis.sectors.slice(0, 2).join(', ')}
                            {thesis.sectors.length > 2 && ` +${thesis.sectors.length - 2}`}
                          </span>
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
            <Button onClick={handleLink} disabled={!selectedThesisId || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                'Link Macro Thesis'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
