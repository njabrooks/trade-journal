'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import type { MacroThesisListItem } from '@/db/queries/macroTheses';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Link2 } from 'lucide-react';
import Link from 'next/link';
import { LinkedEntitiesBadges } from '@/components/linking/LinkedEntitiesBadges';
import { StandardLinkDialog } from '@/components/linking/StandardLinkDialog';
import { LifecycleBadge } from '@/components/ui/lifecycle-badge';

interface UnifiedMacroThesisBrowserProps {
  theses: MacroThesisListItem[];
}

type ThesisTypeFilter = 'all' | 'secular' | 'cyclical' | 'structural';
type TimeHorizonFilter = 'all' | 'long_term' | 'medium_term' | 'short_term';
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low' | 'exploratory';
type StatusFilter = 'all' | 'draft' | 'developing' | 'monitoring' | 'complete' | 'rejected';
type DirectionFilter = 'all' | 'bullish' | 'bearish' | 'neutral';
type SortColumn = 'title' | 'thesisType' | 'timeHorizon' | 'confidence' | 'status' | 'assetTheses' | 'claims' | 'strategies' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export function UnifiedMacroThesisBrowser({ theses }: UnifiedMacroThesisBrowserProps) {
  const router = useRouter();
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

  // Standard Link Dialog
  const [linkingThesis, setLinkingThesis] = useState<{ id: string; title: string } | null>(null);

  // Get badge styling for time horizon
  const getTimeHorizonBadge = (timeHorizon: string | null) => {
    switch (timeHorizon) {
      case 'long_term':
        return { className: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400', label: 'Long' };
      case 'medium_term':
        return { className: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400', label: 'Medium' };
      case 'short_term':
        return { className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', label: 'Short' };
      default:
        return null;
    }
  };

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
          const statusOrder = { draft: 0, developing: 1, monitoring: 2, complete: 3, rejected: 4 };
          aVal = statusOrder[a.status as keyof typeof statusOrder] ?? 0;
          bVal = statusOrder[b.status as keyof typeof statusOrder] ?? 0;
          break;
        case 'assetTheses':
          aVal = a.assetViewCount;
          bVal = b.assetViewCount;
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
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'medium':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
      case 'low':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'exploratory':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Status badge rendering delegated to LifecycleBadge component

  const directionBadgeColor = (direction: string | null) => {
    switch (direction) {
      case 'bullish':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'bearish':
        return 'bg-destructive/15 text-destructive';
      case 'neutral':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const thesisTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'secular':
        return 'bg-violet-500/15 text-violet-600 dark:text-violet-400';
      case 'cyclical':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
      case 'structural':
        return 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400';
      default:
        return 'bg-muted text-muted-foreground';
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
          {showFilters && <span className="text-xs text-muted-foreground">(ESC to close)</span>}
        </Button>
        <div className="text-sm text-muted-foreground">
          Showing {filteredAndSortedTheses.length} of {theses.length} theses
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-card rounded-lg border border p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
              <label className="block text-sm font-medium text-foreground mb-1">
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
              <label className="block text-sm font-medium text-foreground mb-1">
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
              <label className="block text-sm font-medium text-foreground mb-1">
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
              <label className="block text-sm font-medium text-foreground mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="developing">Developing</option>
                <option value="monitoring">Monitoring</option>
                <option value="complete">Complete</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {/* Direction */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
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
      <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedTheses.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No theses match the selected filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center gap-2">
                      Title
                      {getSortIcon('title')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('thesisType')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Type
                      {getSortIcon('thesisType')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('timeHorizon')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Time Horizon
                      {getSortIcon('timeHorizon')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('confidence')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Confidence
                      {getSortIcon('confidence')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Status
                      {getSortIcon('status')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('assetTheses')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Asset Theses
                      {getSortIcon('assetTheses')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('claims')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Claims
                      {getSortIcon('claims')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
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
                      <tr className="border-b hover:bg-muted transition-colors">
                        {/* Title */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/macro-theses/${thesis.id}`}
                            className="text-foreground font-medium hover:text-blue-600 dark:hover:text-blue-400 truncate block"
                            title={thesis.title}
                          >
                            {thesis.title.split(/(\bbullish\b|\bbearish\b|\bneutral\b)/gi).map((part, i) => {
                              const lower = part.toLowerCase();
                              if (lower === 'bullish') {
                                return <span key={i} className="text-emerald-600 font-semibold">{part}</span>;
                              } else if (lower === 'bearish') {
                                return <span key={i} className="text-rose-600 font-semibold">{part}</span>;
                              } else if (lower === 'neutral') {
                                return <span key={i} className="text-muted-foreground font-semibold">{part}</span>;
                              }
                              return part;
                            })}
                          </Link>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3 text-center">
                          <Badge className={`${thesisTypeBadgeColor(thesis.thesisType)} text-xs`}>
                            {thesis.thesisType}
                          </Badge>
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
                              <span className="text-xs text-muted-foreground">—</span>
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
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <LifecycleBadge phase={thesis.status} size="sm" />
                        </td>

                        {/* Asset Theses */}
                        <td className="px-4 py-3">
                          <LinkedEntitiesBadges
                            entities={thesis.linkedAssetTheses.map((at) => ({
                              id: at.id,
                              title: at.title,
                              type: 'asset' as const,
                            }))}
                            isExpanded={isExpanded}
                            onExpand={() => setExpandedThesis(thesis.id)}
                            maxVisibleWhenCollapsed={1}
                          />
                        </td>

                        {/* Claims */}
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-foreground font-medium">
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
                              onClick={() => setLinkingThesis({ id: thesis.id, title: thesis.title })}
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
                        <tr className="bg-muted border-b">
                          <td colSpan={9} className="px-4 py-4">
                            <div className="space-y-4">
                              {/* Description */}
                              {thesis.description && (
                                <div>
                                  <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                                    Description
                                  </h4>
                                  <p className="text-sm text-foreground">{thesis.description}</p>
                                </div>
                              )}

                              {/* Sectors */}
                              {thesis.sectors && thesis.sectors.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
                                    Sectors
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {thesis.sectors.map((sector, idx) => (
                                      <Badge key={idx} className="bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs">
                                        {sector}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Linked Claims Summary */}
                              {thesis.claimCount > 0 && (
                                <div className="bg-muted rounded-lg p-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                                        Linked Claims
                                      </h4>
                                      <p className="text-sm text-muted-foreground">
                                        {thesis.claimCount} claim{thesis.claimCount !== 1 ? 's' : ''} support this thesis
                                      </p>
                                    </div>
                                    <Link
                                      href={`/macro-theses/${thesis.id}#claims`}
                                      className="text-sm font-medium text-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors flex items-center gap-1"
                                    >
                                      View Claims →
                                    </Link>
                                  </div>
                                </div>
                              )}

                              {/* Metadata */}
                              <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                                <div>
                                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Created:</span>
                                  <span className="ml-2 text-sm text-muted-foreground">
                                    {new Date(thesis.createdAt).toLocaleDateString('en-GB')}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Updated:</span>
                                  <span className="ml-2 text-sm text-muted-foreground">
                                    {new Date(thesis.updatedAt).toLocaleDateString('en-GB')}
                                  </span>
                                </div>
                                <div>
                                  <Link
                                    href={`/macro-theses/${thesis.id}`}
                                    className="text-sm text-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
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
      {linkingThesis && (
        <StandardLinkDialog
          sourceType="macroThesis"
          sourceId={linkingThesis.id}
          sourceTitle={linkingThesis.title}
          isOpen={!!linkingThesis}
          onClose={() => setLinkingThesis(null)}
          onSuccess={() => {
            setLinkingThesis(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

