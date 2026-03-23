'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search } from 'lucide-react';

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

interface MacroThesisSelectorProps {
  onSelect: (macroThesisId: string) => Promise<void>;
  onCancel: () => void;
  currentThesisId?: string | null;
}

export function MacroThesisSelector({
  onSelect,
  onCancel,
  currentThesisId,
}: MacroThesisSelectorProps) {
  const [theses, setTheses] = useState<MacroThesis[]>([]);
  const [filteredTheses, setFilteredTheses] = useState<MacroThesis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThesisId, setSelectedThesisId] = useState<string | null>(currentThesisId || null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [thesisTypeFilter, setThesisTypeFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Fetch theses on mount
  useEffect(() => {
    fetchTheses();
  }, []);

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
      setTheses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching macro theses:', err);
      setError('Failed to load macro theses. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = async (thesisId: string) => {
    setSelecting(thesisId);
    setError(null);
    try {
      await onSelect(thesisId);
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
          placeholder="Search by title or sector..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Thesis Type</label>
          <Select value={thesisTypeFilter} onValueChange={setThesisTypeFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="secular">Secular</SelectItem>
              <SelectItem value="cyclical">Cyclical</SelectItem>
              <SelectItem value="structural">Structural</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Direction</label>
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Directions</SelectItem>
              <SelectItem value="bullish">Bullish</SelectItem>
              <SelectItem value="bearish">Bearish</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="developing">Developing</SelectItem>
              <SelectItem value="monitoring">Monitoring</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Thesis List */}
      {error && !selecting ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      ) : filteredTheses.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <p>No macro theses found matching your filters.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setThesisTypeFilter('all');
              setDirectionFilter('all');
              setStatusFilter('all');
            }}
            className="text-blue-600 hover:text-blue-800 text-sm mt-2"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredTheses.map((thesis) => (
            <div
              key={thesis.id}
              className={`flex items-start justify-between p-3 rounded-lg border-2 transition-all ${
                selectedThesisId === thesis.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <button
                onClick={() => setSelectedThesisId(thesis.id)}
                className="flex-1 text-left"
              >
                <div className="font-medium text-slate-900">{thesis.title}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">
                    {thesis.thesisType}
                  </span>
                  {thesis.direction && (
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                        thesis.direction === 'bullish'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : thesis.direction === 'bearish'
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {thesis.direction}
                    </span>
                  )}
                  {thesis.confidenceLevel && (
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">
                      {thesis.confidenceLevel}
                    </span>
                  )}
                  {thesis.sectors && thesis.sectors.length > 0 && (
                    <span className="text-xs text-slate-500">
                      {thesis.sectors.slice(0, 2).join(', ')}
                      {thesis.sectors.length > 2 && ` +${thesis.sectors.length - 2}`}
                    </span>
                  )}
                </div>
              </button>
              <Button
                size="sm"
                onClick={() => handleSelect(thesis.id)}
                disabled={selecting !== null || selectedThesisId !== thesis.id}
                className="ml-3 shrink-0"
              >
                {selecting === thesis.id ? (
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

