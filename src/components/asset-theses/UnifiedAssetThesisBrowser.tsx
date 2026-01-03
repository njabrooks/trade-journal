'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import type { AssetThesisListItem } from '@/db/queries/assetTheses';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Link2 } from 'lucide-react';
import Link from 'next/link';
import { LinkedEntitiesBadges } from '@/components/linking/LinkedEntitiesBadges';
import { StandardLinkDialog } from '@/components/linking/StandardLinkDialog';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';

interface UnifiedAssetThesisBrowserProps {
  assetTheses: AssetThesisListItem[];
}

type TimeHorizonFilter = 'all' | 'long_term' | 'medium_term' | 'short_term';
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low' | 'exploratory';
type StatusFilter = 'all' | 'active' | 'under_review' | 'retired' | 'superseded';
type DirectionFilter = 'all' | 'bullish' | 'bearish' | 'neutral';
type SortColumn = 'title' | 'underlying' | 'macroThesis' | 'timeHorizon' | 'confidence' | 'status' | 'claims' | 'strategies' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export function UnifiedAssetThesisBrowser({ assetTheses }: UnifiedAssetThesisBrowserProps) {
  const router = useRouter();
  const [expandedThesis, setExpandedThesis] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [timeHorizonFilter, setTimeHorizonFilter] = useState<TimeHorizonFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [underlyingFilter, setUnderlyingFilter] = useState<string>('all');
  const [macroThesisFilter, setMacroThesisFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Sort states
  const [sortColumn, setSortColumn] = useState<SortColumn>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Standard Link Dialog
  const [linkingAssetThesis, setLinkingAssetThesis] = useState<{ id: string; title: string } | null>(null);

  // Get badge styling for time horizon
  const getTimeHorizonBadge = (timeHorizon: string | null) => {
    switch (timeHorizon) {
      case 'long_term':
        return { className: 'bg-indigo-100 text-indigo-700', label: 'Long' };
      case 'medium_term':
        return { className: 'bg-cyan-100 text-cyan-700', label: 'Medium' };
      case 'short_term':
        return { className: 'bg-teal-100 text-teal-700', label: 'Short' };
      default:
        return null;
    }
  };

  // Get unique underlyings and macro theses for filters
  const uniqueUnderlyings = useMemo(() => {
    const underlyings = new Set<string>();
    assetTheses.forEach((thesis) => {
      if (thesis.ticker) underlyings.add(thesis.ticker);
    });
    return Array.from(underlyings).sort();
  }, [assetTheses]);

  const uniqueMacroTheses = useMemo(() => {
    const theses = new Map<string, string>();
    assetTheses.forEach((thesis) => {
      thesis.linkedMacroTheses.forEach((lmt) => {
        theses.set(lmt.id, lmt.title);
      });
    });
    return Array.from(theses.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [assetTheses]);

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
    let filtered = [...assetTheses];

    // Apply filters
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

    if (underlyingFilter !== 'all') {
      filtered = filtered.filter((t) => t.ticker === underlyingFilter);
    }

    if (macroThesisFilter !== 'all') {
      filtered = filtered.filter((t) =>
        t.linkedMacroTheses.some((lmt) => lmt.id === macroThesisFilter)
      );
    }

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((t) => {
        const searchableText = [
          t.title,
          t.description,
          t.ticker,
          t.underlyingName,
          ...t.linkedMacroTheses.map((lmt) => lmt.title),
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
        case 'underlying':
          aVal = a.ticker?.toLowerCase() || '';
          bVal = b.ticker?.toLowerCase() || '';
          break;
        case 'macroThesis':
          aVal = a.linkedMacroTheses[0]?.title?.toLowerCase() || '';
          bVal = b.linkedMacroTheses[0]?.title?.toLowerCase() || '';
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
        case 'claims':
          aVal = a.claimCount;
          bVal = b.claimCount;
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
    assetTheses,
    timeHorizonFilter,
    confidenceFilter,
    statusFilter,
    directionFilter,
    underlyingFilter,
    macroThesisFilter,
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
          Showing {filteredAndSortedTheses.length} of {assetTheses.length} asset theses
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
              placeholder="Search title, ticker, description... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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

            {/* Underlying */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Underlying
              </label>
              <select
                value={underlyingFilter}
                onChange={(e) => setUnderlyingFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Underlyings</option>
                {uniqueUnderlyings.map((ticker) => (
                  <option key={ticker} value={ticker}>
                    {ticker}
                  </option>
                ))}
              </select>
            </div>

            {/* Macro Thesis */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Macro Thesis
              </label>
              <select
                value={macroThesisFilter}
                onChange={(e) => setMacroThesisFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Theses</option>
                {uniqueMacroTheses.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
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
                setTimeHorizonFilter('all');
                setConfidenceFilter('all');
                setStatusFilter('all');
                setDirectionFilter('all');
                setUnderlyingFilter('all');
                setMacroThesisFilter('all');
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
              No asset theses match the selected filters.
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
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('underlying')}
                  >
                    <div className="flex items-center gap-2">
                      Underlying
                      {getSortIcon('underlying')}
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
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('macroThesis')}
                  >
                    <div className="flex items-center gap-2">
                      Macro Theses
                      {getSortIcon('macroThesis')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('claims')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Claims
                      {getSortIcon('claims')}
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
                          <Link
                            href={`/asset-theses/${thesis.id}`}
                            className="text-slate-900 font-medium hover:text-blue-600 truncate block"
                            title={thesis.title}
                          >
                            {thesis.title.split(/(\bbullish\b|\bbearish\b|\bneutral\b)/gi).map((part, i) => {
                              const lower = part.toLowerCase();
                              if (lower === 'bullish') {
                                return <span key={i} className="text-emerald-600 font-semibold">{part}</span>;
                              } else if (lower === 'bearish') {
                                return <span key={i} className="text-rose-600 font-semibold">{part}</span>;
                              } else if (lower === 'neutral') {
                                return <span key={i} className="text-slate-600 font-semibold">{part}</span>;
                              }
                              return part;
                            })}
                          </Link>
                        </td>

                        {/* Underlying */}
                        <td className="px-4 py-3">
                          {thesis.ticker ? (
                            <div className="font-mono font-medium text-slate-900">{thesis.ticker}</div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Time Horizon */}
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const horizonBadge = getTimeHorizonBadge(thesis.timeHorizon);
                            return horizonBadge ? (
                              <Badge className={`${horizonBadge.className} text-xs`}>
                                {horizonBadge.label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            );
                          })()}
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

                        {/* Macro Theses */}
                        <td className="px-4 py-3">
                          <LinkedEntitiesBadges
                            entities={thesis.linkedMacroTheses.map((lmt) => ({
                              id: lmt.id,
                              title: lmt.title,
                              type: 'macro' as const,
                            }))}
                            isExpanded={isExpanded}
                            onExpand={() => setExpandedThesis(thesis.id)}
                            maxVisibleWhenCollapsed={1}
                          />
                        </td>

                        {/* Claims */}
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-slate-700 font-medium">
                            {thesis.claimCount}
                          </span>
                        </td>

                        {/* Strategies */}
                        <td className="px-4 py-3">
                          <LinkedEntitiesBadges
                            entities={thesis.linkedStrategies.map((s) => ({
                              id: s.id,
                              title: s.label || s.id,
                              type: 'strategy' as const,
                            }))}
                            isExpanded={isExpanded}
                            onExpand={() => setExpandedThesis(thesis.id)}
                            maxVisibleWhenCollapsed={1}
                          />
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setLinkingAssetThesis({ id: thesis.id, title: thesis.title })}
                              className="h-7 w-7 p-0"
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
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
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Details Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50 border-b">
                          <td colSpan={9} className="px-4 py-4">
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

                              {/* Linked Claims Summary */}
                              {thesis.claimCount > 0 && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h4 className="text-xs font-semibold text-blue-900 mb-1 uppercase tracking-wide">
                                        Linked Claims
                                      </h4>
                                      <p className="text-sm text-blue-800">
                                        {thesis.claimCount} claim{thesis.claimCount !== 1 ? 's' : ''} support this thesis
                                      </p>
                                    </div>
                                    <Link
                                      href={`/asset-theses/${thesis.id}#claims`}
                                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                    >
                                      View Claims →
                                    </Link>
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
                                    href={`/asset-theses/${thesis.id}`}
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

      {/* Standard Link Dialog */}
      {linkingAssetThesis && (
        <StandardLinkDialog
          sourceType="assetThesis"
          sourceId={linkingAssetThesis.id}
          sourceTitle={linkingAssetThesis.title}
          isOpen={!!linkingAssetThesis}
          onClose={() => setLinkingAssetThesis(null)}
          onSuccess={() => {
            setLinkingAssetThesis(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

