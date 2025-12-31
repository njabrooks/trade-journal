'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import type { MacroThesisListItem } from '@/db/queries/macroTheses';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import Link from 'next/link';
import { LinkAssetThesesToMacroDialog } from './LinkAssetThesesToMacroDialog';

interface UnifiedMacroThesisBrowserProps {
  theses: MacroThesisListItem[];
}

type ThesisTypeFilter = 'all' | 'secular' | 'cyclical' | 'structural';
type TimeHorizonFilter = 'all' | 'long_term' | 'medium_term' | 'short_term';
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low' | 'exploratory';
type StatusFilter = 'all' | 'active' | 'under_review' | 'retired' | 'superseded';
type DirectionFilter = 'all' | 'bullish' | 'bearish' | 'neutral';
type SortColumn = 'title' | 'thesisType' | 'timeHorizon' | 'confidence' | 'status' | 'assetTheses' | 'strategies' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export function UnifiedMacroThesisBrowser({ theses }: UnifiedMacroThesisBrowserProps) {
  const [expandedThesis, setExpandedThesis] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [thesisTypeFilter, setThesisTypeFilter] = useState<ThesisTypeFilter>('all');
  const [timeHorizonFilter, setTimeHorizonFilter] = useState<TimeHorizonFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Sort states
  const [sortColumn, setSortColumn] = useState<SortColumn>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Link Asset Theses Dialog
  const [linkingAssetThesis, setLinkingAssetThesis] = useState<{ id: string; title: string } | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        if (!showFilters) {
          setShowFilters(true);
        }
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
      }

      if (e.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('');
        } else if (showFilters) {
          setShowFilters(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, showFilters]);

  // Filter and sort theses
  const filteredAndSortedTheses = useMemo(() => {
    let filtered = [...theses];

    // Apply filters
    if (thesisTypeFilter !== 'all') {
      filtered = filtered.filter((t) => t.thesisType === thesisTypeFilter);
    }

    if (timeHorizonFilter !== 'all') {
      filtered = filtered.filter((t) => t.timeHorizon === timeHorizonFilter);
    }

    if (confidenceFilter !== 'all') {
      filtered = filtered.filter((t) => t.confidenceLevel === confidenceFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }

    if (directionFilter !== 'all') {
      filtered = filtered.filter((t) => t.direction === directionFilter);
    }

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((t) => {
        const searchableText = [
          t.title,
          t.description,
          ...(t.sectors || []),
          t.thesisType,
          t.direction,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(query);
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'thesisType':
          aVal = a.thesisType;
          bVal = b.thesisType;
          break;
        case 'timeHorizon':
          const horizonOrder = { long_term: 3, medium_term: 2, short_term: 1, null: 0 };
          aVal = horizonOrder[a.timeHorizon as keyof typeof horizonOrder] ?? 0;
          bVal = horizonOrder[b.timeHorizon as keyof typeof horizonOrder] ?? 0;
          break;
        case 'confidence':
          const confidenceOrder = { high: 3, medium: 2, low: 1, exploratory: 0, null: -1 };
          aVal = confidenceOrder[a.confidenceLevel as keyof typeof confidenceOrder] ?? -1;
          bVal = confidenceOrder[b.confidenceLevel as keyof typeof confidenceOrder] ?? -1;
          break;
        case 'status':
          const statusOrder = { active: 0, under_review: 1, retired: 2, superseded: 3 };
          aVal = statusOrder[a.status as keyof typeof statusOrder] ?? 0;
          bVal = statusOrder[b.status as keyof typeof statusOrder] ?? 0;
          break;
        case 'assetTheses':
          aVal = a.assetViewCount;
          bVal = b.assetViewCount;
          break;
        case 'strategies':
          aVal = a.strategyCount;
          bVal = b.strategyCount;
          break;
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [
    theses,
    thesisTypeFilter,
    timeHorizonFilter,
    confidenceFilter,
    statusFilter,
    directionFilter,
    searchQuery,
    sortColumn,
    sortDirection,
  ]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  const confidenceBadgeColor = (confidence: string | null) => {
    switch (confidence) {
      case 'high':
        return 'bg-emerald-100 text-emerald-700';
      case 'medium':
        return 'bg-blue-100 text-blue-700';
      case 'low':
        return 'bg-amber-100 text-amber-700';
      case 'exploratory':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-100 text-emerald-700';
      case 'under_review':
        return 'bg-amber-100 text-amber-700';
      case 'retired':
        return 'bg-slate-200 text-slate-700';
      case 'superseded':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const directionBadgeColor = (direction: string | null) => {
    switch (direction) {
      case 'bullish':
        return 'bg-emerald-100 text-emerald-700';
      case 'bearish':
        return 'bg-rose-100 text-rose-700';
      case 'neutral':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const thesisTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'secular':
        return 'bg-purple-100 text-purple-700';
      case 'cyclical':
        return 'bg-blue-100 text-blue-700';
      case 'structural':
        return 'bg-indigo-100 text-indigo-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {showFilters && <span className="text-xs text-slate-500">(ESC to close)</span>}
        </Button>
        <div className="text-sm text-slate-600">
          Showing {filteredAndSortedTheses.length} of {theses.length} theses
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search theses, sectors, description... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Thesis Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Thesis Type
              </label>
              <select
                value={thesisTypeFilter}
                onChange={(e) => setThesisTypeFilter(e.target.value as ThesisTypeFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="secular">Secular</option>
                <option value="cyclical">Cyclical</option>
                <option value="structural">Structural</option>
              </select>
            </div>

            {/* Time Horizon */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Time Horizon
              </label>
              <select
                value={timeHorizonFilter}
                onChange={(e) => setTimeHorizonFilter(e.target.value as TimeHorizonFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Horizons</option>
                <option value="long_term">Long Term</option>
                <option value="medium_term">Medium Term</option>
                <option value="short_term">Short Term</option>
              </select>
            </div>

            {/* Confidence */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Confidence
              </label>
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Levels</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="exploratory">Exploratory</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="under_review">Under Review</option>
                <option value="retired">Retired</option>
                <option value="superseded">Superseded</option>
              </select>
            </div>

            {/* Direction */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Direction
              </label>
              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Directions</option>
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>
          </div>

          {/* Clear Filters */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setThesisTypeFilter('all');
                setTimeHorizonFilter('all');
                setConfidenceFilter('all');
                setStatusFilter('all');
                setDirectionFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Theses Table */}
      <section className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedTheses.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              No theses match the selected filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center gap-2">
                      Title
                      {getSortIcon('title')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('thesisType')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Type
                      {getSortIcon('thesisType')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('timeHorizon')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Time Horizon
                      {getSortIcon('timeHorizon')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('confidence')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Confidence
                      {getSortIcon('confidence')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Status
                      {getSortIcon('status')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('assetTheses')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Asset Theses
                      {getSortIcon('assetTheses')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('strategies')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Strategies
                      {getSortIcon('strategies')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedTheses.map((thesis) => {
                  const isExpanded = expandedThesis === thesis.id;

                  return (
                    <Fragment key={thesis.id}>
                      {/* Main Row */}
                      <tr className="border-b hover:bg-slate-50 transition-colors">
                        {/* Title */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <Link
                              href={`/macro-theses/${thesis.id}`}
                              className="text-slate-900 font-medium hover:text-blue-600 line-clamp-2"
                            >
                              {thesis.title}
                            </Link>
                            {thesis.direction && (
                              <Badge className={`${directionBadgeColor(thesis.direction)} text-xs`}>
                                {thesis.direction}
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3 text-center">
                          <Badge className={`${thesisTypeBadgeColor(thesis.thesisType)} text-xs`}>
                            {thesis.thesisType}
                          </Badge>
                        </td>

                        {/* Time Horizon */}
                        <td className="px-4 py-3 text-center">
                          <span className="text-slate-600 capitalize text-xs">
                            {thesis.timeHorizon?.replace('_', ' ') || '—'}
                          </span>
                        </td>

                        {/* Confidence */}
                        <td className="px-4 py-3 text-center">
                          {thesis.confidenceLevel ? (
                            <Badge className={`${confidenceBadgeColor(thesis.confidenceLevel)} text-xs`}>
                              {thesis.confidenceLevel}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <Badge className={`${statusBadgeColor(thesis.status)} text-xs`}>
                            {thesis.status.replace('_', ' ')}
                          </Badge>
                        </td>

                        {/* Asset Theses Count */}
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setLinkingAssetThesis({ id: thesis.id, title: thesis.title })}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium cursor-pointer"
                          >
                            {thesis.assetViewCount}
                          </button>
                        </td>

                        {/* Strategies Count */}
                        <td className="px-4 py-3 text-center">
                          <Link
                            href={`/strategies?macroThesisId=${thesis.id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          >
                            {thesis.strategyCount}
                          </Link>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandedThesis(isExpanded ? null : thesis.id)}
                            className="h-7 w-7 p-0"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </td>
                      </tr>

                      {/* Expanded Details Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50 border-b">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="space-y-4">
                              {/* Description */}
                              {thesis.description && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                                    Description
                                  </h4>
                                  <p className="text-sm text-slate-900">{thesis.description}</p>
                                </div>
                              )}

                              {/* Sectors */}
                              {thesis.sectors && thesis.sectors.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
                                    Sectors
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {thesis.sectors.map((sector, idx) => (
                                      <Badge key={idx} className="bg-blue-100 text-blue-700 text-xs">
                                        {sector}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Metadata */}
                              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-200">
                                <div>
                                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Created:</span>
                                  <span className="ml-2 text-sm text-slate-600">
                                    {new Date(thesis.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Updated:</span>
                                  <span className="ml-2 text-sm text-slate-600">
                                    {new Date(thesis.updatedAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div>
                                  <Link
                                    href={`/macro-theses/${thesis.id}`}
                                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                                  >
                                    View Full Details →
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Link Asset Theses to Macro Thesis Dialog */}
      {linkingAssetThesis && (
        <LinkAssetThesesToMacroDialog
          macroThesisId={linkingAssetThesis.id}
          macroThesisTitle={linkingAssetThesis.title}
          isOpen={!!linkingAssetThesis}
          onClose={() => setLinkingAssetThesis(null)}
        />
      )}
    </div>
  );
}

