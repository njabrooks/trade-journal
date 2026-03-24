'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import type { ResearchArtifactListItem } from '@/db/queries/research';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { ArtifactClaimsBrowser } from './ArtifactClaimsBrowser';

interface UnifiedResearchBrowserProps {
  artifacts: ResearchArtifactListItem[];
}

type StatusFilter = 'all' | 'raw' | 'processing' | 'structured' | 'error';
type SourceTypeFilter = 'all' | string;
type ClaimsFilter = 'all' | 'has_unconfirmed' | 'all_confirmed' | 'no_claims';
type SortColumn = 'title' | 'sourceType' | 'status' | 'author' | 'claims' | 'unconfirmedClaims' | 'ingestedAt' | 'publishedDate';
type SortDirection = 'asc' | 'desc';

export function UnifiedResearchBrowser({ artifacts }: UnifiedResearchBrowserProps) {
  const router = useRouter();
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceTypeFilter>('all');
  const [claimsFilter, setClaimsFilter] = useState<ClaimsFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Sort states
  const [sortColumn, setSortColumn] = useState<SortColumn>('ingestedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Get unique source types for filter dropdown
  const uniqueSourceTypes = useMemo(() => {
    const types = new Set<string>();
    artifacts.forEach((artifact) => {
      if (artifact.sourceType) types.add(artifact.sourceType);
    });
    return Array.from(types).sort();
  }, [artifacts]);

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

  // Filter and sort artifacts
  const filteredAndSortedArtifacts = useMemo(() => {
    let filtered = [...artifacts];

    // Apply filters
    if (statusFilter !== 'all') {
      filtered = filtered.filter((a) => a.status === statusFilter);
    }

    if (sourceTypeFilter !== 'all') {
      filtered = filtered.filter((a) => a.sourceType === sourceTypeFilter);
    }

    if (claimsFilter === 'has_unconfirmed') {
      filtered = filtered.filter((a) => a.unconfirmedClaimCount > 0);
    } else if (claimsFilter === 'all_confirmed') {
      filtered = filtered.filter((a) => a.claimCount > 0 && a.unconfirmedClaimCount === 0);
    } else if (claimsFilter === 'no_claims') {
      filtered = filtered.filter((a) => a.claimCount === 0);
    }

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((a) => {
        const searchableText = [
          a.title,
          a.author,
          a.sourceType,
          ...(a.tags || []),
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
        case 'sourceType':
          aVal = a.sourceType.toLowerCase();
          bVal = b.sourceType.toLowerCase();
          break;
        case 'status':
          const statusOrder = { structured: 0, processing: 1, raw: 2, error: 3 };
          aVal = statusOrder[a.status as keyof typeof statusOrder] ?? 99;
          bVal = statusOrder[b.status as keyof typeof statusOrder] ?? 99;
          break;
        case 'author':
          aVal = (a.author || '').toLowerCase();
          bVal = (b.author || '').toLowerCase();
          break;
        case 'claims':
          aVal = a.claimCount;
          bVal = b.claimCount;
          break;
        case 'unconfirmedClaims':
          aVal = a.unconfirmedClaimCount;
          bVal = b.unconfirmedClaimCount;
          break;
        case 'ingestedAt':
          aVal = new Date(a.ingestedAt).getTime();
          bVal = new Date(b.ingestedAt).getTime();
          break;
        case 'publishedDate':
          aVal = a.publishedDate ? new Date(a.publishedDate).getTime() : 0;
          bVal = b.publishedDate ? new Date(b.publishedDate).getTime() : 0;
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
    artifacts,
    statusFilter,
    sourceTypeFilter,
    claimsFilter,
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

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'structured':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'processing':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
      case 'raw':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'error':
        return 'bg-destructive/15 text-destructive';
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
          Showing {filteredAndSortedArtifacts.length} of {artifacts.length} artifacts
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
              placeholder="Search title, author, tags... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="structured">Structured</option>
                <option value="processing">Processing</option>
                <option value="raw">Raw</option>
                <option value="error">Error</option>
              </select>
            </div>

            {/* Source Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Source Type
              </label>
              <select
                value={sourceTypeFilter}
                onChange={(e) => setSourceTypeFilter(e.target.value)}
                className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                {uniqueSourceTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Claims */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Claims
              </label>
              <select
                value={claimsFilter}
                onChange={(e) => setClaimsFilter(e.target.value as ClaimsFilter)}
                className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="has_unconfirmed">Has Unconfirmed</option>
                <option value="all_confirmed">All Confirmed</option>
                <option value="no_claims">No Claims</option>
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
                setStatusFilter('all');
                setSourceTypeFilter('all');
                setClaimsFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Artifacts Table */}
      <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedArtifacts.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No artifacts match the selected filters.
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
                    className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('sourceType')}
                  >
                    <div className="flex items-center gap-2">
                      Source Type
                      {getSortIcon('sourceType')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('author')}
                  >
                    <div className="flex items-center gap-2">
                      Author
                      {getSortIcon('author')}
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
                    onClick={() => handleSort('claims')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Claims
                      {getSortIcon('claims')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('unconfirmedClaims')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Unconfirmed
                      {getSortIcon('unconfirmedClaims')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('ingestedAt')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Ingested
                      {getSortIcon('ingestedAt')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedArtifacts.map((artifact) => {
                  const isExpanded = expandedArtifact === artifact.id;

                  return (
                    <Fragment key={artifact.id}>
                      {/* Main Row */}
                      <tr className="border-b hover:bg-muted transition-colors">
                        {/* Title */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/research/${artifact.id}`}
                            className="text-foreground font-medium hover:text-blue-600 hover:underline block line-clamp-2"
                            title={artifact.title}
                          >
                            {artifact.title}
                          </Link>
                        </td>

                        {/* Source Type */}
                        <td className="px-4 py-3">
                          <Badge className="bg-muted text-muted-foreground text-xs capitalize">
                            {artifact.sourceType}
                          </Badge>
                        </td>

                        {/* Author */}
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {artifact.author || <span className="text-muted-foreground">—</span>}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <Badge className={`${statusBadgeColor(artifact.status)} text-xs`}>
                            {artifact.status}
                          </Badge>
                        </td>

                        {/* Claims */}
                        <td className="px-4 py-3 text-center">
                          {artifact.claimCount > 0 ? (
                            <Badge className="bg-muted text-muted-foreground text-xs">
                              {artifact.claimCount}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Unconfirmed Claims */}
                        <td className="px-4 py-3 text-center">
                          {artifact.unconfirmedClaimCount > 0 ? (
                            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs">
                              {artifact.unconfirmedClaimCount}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Ingested */}
                        <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                          {new Date(artifact.ingestedAt).toLocaleDateString('en-GB')}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpandedArtifact(isExpanded ? null : artifact.id)}
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
                          <td colSpan={8} className="px-4 py-4">
                            <div className="space-y-4">
                              {/* Claims Browser */}
                              {artifact.hasInsight && artifact.claimCount > 0 ? (
                                <ArtifactClaimsBrowser artifactId={artifact.id} />
                              ) : (
                                <div className="py-4 text-center text-sm text-muted-foreground">
                                  No claims have been extracted from this research artifact yet.
                                </div>
                              )}
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
    </div>
  );
}

