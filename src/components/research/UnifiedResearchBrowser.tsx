'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import type { ResearchArtifactListItem } from '@/db/queries/research';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface UnifiedResearchBrowserProps {
  artifacts: ResearchArtifactListItem[];
}

type StatusFilter = 'all' | 'raw' | 'processing' | 'structured' | 'error';
type SourceTypeFilter = 'all' | string;
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
        return 'bg-emerald-100 text-emerald-700';
      case 'processing':
        return 'bg-blue-100 text-blue-700';
      case 'raw':
        return 'bg-amber-100 text-amber-700';
      case 'error':
        return 'bg-red-100 text-red-700';
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
          Showing {filteredAndSortedArtifacts.length} of {artifacts.length} artifacts
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
              placeholder="Search title, author, tags... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                <option value="structured">Structured</option>
                <option value="processing">Processing</option>
                <option value="raw">Raw</option>
                <option value="error">Error</option>
              </select>
            </div>

            {/* Source Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Source Type
              </label>
              <select
                value={sourceTypeFilter}
                onChange={(e) => setSourceTypeFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                {uniqueSourceTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
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
                setStatusFilter('all');
                setSourceTypeFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Artifacts Table */}
      <section className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedArtifacts.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              No artifacts match the selected filters.
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
                    onClick={() => handleSort('sourceType')}
                  >
                    <div className="flex items-center gap-2">
                      Source Type
                      {getSortIcon('sourceType')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('author')}
                  >
                    <div className="flex items-center gap-2">
                      Author
                      {getSortIcon('author')}
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
                    onClick={() => handleSort('claims')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Claims
                      {getSortIcon('claims')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('unconfirmedClaims')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Unconfirmed
                      {getSortIcon('unconfirmedClaims')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
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
                      <tr className="border-b hover:bg-slate-50 transition-colors">
                        {/* Title */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/research/${artifact.id}`}
                            className="text-slate-900 font-medium hover:text-blue-600 hover:underline block line-clamp-2"
                            title={artifact.title}
                          >
                            {artifact.title}
                          </Link>
                          {artifact.sourceUrl && (
                            <a
                              href={artifact.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1 mt-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span className="truncate max-w-[200px]">{artifact.sourceUrl}</span>
                            </a>
                          )}
                        </td>

                        {/* Source Type */}
                        <td className="px-4 py-3 text-sm text-slate-600 capitalize">
                          {artifact.sourceType}
                        </td>

                        {/* Author */}
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {artifact.author || <span className="text-slate-400">—</span>}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <Badge className={`${statusBadgeColor(artifact.status)} text-xs`}>
                            {artifact.status}
                          </Badge>
                        </td>

                        {/* Claims */}
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-slate-700 font-medium">
                            {artifact.claimCount}
                          </span>
                        </td>

                        {/* Unconfirmed Claims */}
                        <td className="px-4 py-3 text-center">
                          {artifact.unconfirmedClaimCount > 0 ? (
                            <Badge className="bg-amber-100 text-amber-700 text-xs">
                              {artifact.unconfirmedClaimCount}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        {/* Ingested */}
                        <td className="px-4 py-3 text-center text-xs text-slate-600">
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
                        <tr className="bg-slate-50 border-b">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="space-y-4">
                              {/* Tags */}
                              {artifact.tags && artifact.tags.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
                                    Tags
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {artifact.tags.map((tag, idx) => (
                                      <Badge key={idx} className="bg-blue-100 text-blue-700 text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Claims Summary */}
                              {artifact.hasInsight && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h4 className="text-xs font-semibold text-blue-900 mb-1 uppercase tracking-wide">
                                        Claims Summary
                                      </h4>
                                      <p className="text-sm text-blue-800">
                                        {artifact.claimCount} total claim{artifact.claimCount !== 1 ? 's' : ''}
                                        {artifact.unconfirmedClaimCount > 0 && (
                                          <span className="ml-2">
                                            ({artifact.unconfirmedClaimCount} unconfirmed)
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                    <Link
                                      href={`/research/${artifact.id}#claims`}
                                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                    >
                                      View Claims →
                                    </Link>
                                  </div>
                                </div>
                              )}

                              {/* Metadata */}
                              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-200">
                                {artifact.publishedDate && (
                                  <div>
                                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Published:</span>
                                    <span className="ml-2 text-sm text-slate-600">
                                      {new Date(artifact.publishedDate).toLocaleDateString('en-GB')}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Created:</span>
                                  <span className="ml-2 text-sm text-slate-600">
                                    {new Date(artifact.createdAt).toLocaleDateString('en-GB')}
                                  </span>
                                </div>
                                <div>
                                  <Link
                                    href={`/research/${artifact.id}`}
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
    </div>
  );
}

