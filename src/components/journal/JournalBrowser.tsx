'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { JournalEntry } from '@/db/schema';

// Extended type for journal entries with underlying tickers and batch_id
type JournalEntryWithUnderlying = JournalEntry & {
  underlyingTickers: string[];
  batchId: string | null;
};

// A display row can be either a single entry or a collapsed batch
type DisplayRow =
  | { type: 'single'; entry: JournalEntryWithUnderlying }
  | { type: 'batch'; batchId: string; entries: JournalEntryWithUnderlying[]; summary: BatchSummary };

type BatchSummary = {
  timestamp: Date;
  objectTitle: string;
  objectType: string;
  actionTypes: string[];
  totalCount: number;
  source: string;
  underlyingTickers: string[];
};

// Simple date formatting utilities
function formatDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface JournalBrowserProps {
  entries: JournalEntryWithUnderlying[];
  totalEntries: number;
  objectTypes: string[];
  actionTypes: string[];
  sources: string[];
  underlyings: string[];
}

type ObjectTypeFilter = string | 'all';
type ActionTypeFilter = string | 'all';
type SourceFilter = string | 'all';
type UnderlyingFilter = string | 'all';
type SortColumn = 'timestamp' | 'objectTitle' | 'actionType' | 'objectType' | 'source' | 'underlying';
type SortDirection = 'asc' | 'desc';

export function JournalBrowser({ entries, totalEntries, objectTypes, actionTypes, sources, underlyings }: JournalBrowserProps) {
  const router = useRouter();
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [objectTypeFilter, setObjectTypeFilter] = useState<ObjectTypeFilter>('all');
  const [actionTypeFilter, setActionTypeFilter] = useState<ActionTypeFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [underlyingFilter, setUnderlyingFilter] = useState<UnderlyingFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Sort states
  const [sortColumn, setSortColumn] = useState<SortColumn>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Server-side filtering state
  const [apiEntries, setApiEntries] = useState<JournalEntryWithUnderlying[] | null>(null);
  const [totalCount, setTotalCount] = useState(totalEntries);
  const [isLoading, setIsLoading] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input for API calls
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch from API when filters change (server-side filtering)
  useEffect(() => {
    const hasFilters =
      objectTypeFilter !== 'all' ||
      actionTypeFilter !== 'all' ||
      sourceFilter !== 'all' ||
      underlyingFilter !== 'all' ||
      debouncedSearch !== '';

    if (!hasFilters) {
      setApiEntries(null);
      setTotalCount(totalEntries);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (objectTypeFilter !== 'all') params.set('objectType', objectTypeFilter);
    if (actionTypeFilter !== 'all') params.set('actionType', actionTypeFilter);
    if (sourceFilter !== 'all') params.set('source', sourceFilter);
    if (underlyingFilter !== 'all') params.set('underlying', underlyingFilter);
    if (debouncedSearch) params.set('search', debouncedSearch);
    params.set('limit', '500');

    setIsLoading(true);
    fetch(`/api/journal?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setApiEntries(data.entries);
        setTotalCount(data.total);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch journal entries:', err);
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [objectTypeFilter, actionTypeFilter, sourceFilter, underlyingFilter, debouncedSearch, totalEntries]);

  // Use API entries when filters are active, otherwise use server-rendered prop data
  const activeEntries = apiEntries ?? entries;

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
        } else if (expandedEntry) {
          setExpandedEntry(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, showFilters, expandedEntry]);

  // Filter and sort entries
  // When API data is loaded, server already filtered — client-side filters are redundant but harmless.
  // Client-side search provides instant feedback while debounce is pending.
  const filteredAndSortedEntries = useMemo(() => {
    let filtered = [...activeEntries];

    // Filter by object type
    if (objectTypeFilter !== 'all') {
      filtered = filtered.filter((e) => e.objectType === objectTypeFilter);
    }

    // Filter by action type
    if (actionTypeFilter !== 'all') {
      filtered = filtered.filter((e) => e.actionType === actionTypeFilter);
    }

    // Filter by source
    if (sourceFilter !== 'all') {
      filtered = filtered.filter((e) => e.source === sourceFilter);
    }

    // Filter by underlying (checks if filter value is in the array of linked underlyings)
    if (underlyingFilter !== 'all') {
      filtered = filtered.filter((e) => e.underlyingTickers.includes(underlyingFilter));
    }

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((e) => {
        const searchableText = [
          e.objectTitle,
          e.actionDescription,
          e.rationale,
          e.actionType,
          e.objectType,
          e.skillInvoked,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(query);
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortColumn) {
        case 'timestamp':
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
        case 'objectTitle':
          aVal = (a.objectTitle || '').toLowerCase();
          bVal = (b.objectTitle || '').toLowerCase();
          break;
        case 'actionType':
          aVal = a.actionType.toLowerCase();
          bVal = b.actionType.toLowerCase();
          break;
        case 'objectType':
          aVal = a.objectType.toLowerCase();
          bVal = b.objectType.toLowerCase();
          break;
        case 'source':
          aVal = a.source.toLowerCase();
          bVal = b.source.toLowerCase();
          break;
        case 'underlying':
          aVal = (a.underlyingTickers[0] || '').toLowerCase();
          bVal = (b.underlyingTickers[0] || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [activeEntries, objectTypeFilter, actionTypeFilter, sourceFilter, underlyingFilter, searchQuery, sortColumn, sortDirection]);

  // Group entries by batch_id to create display rows
  const displayRows = useMemo((): DisplayRow[] => {
    const rows: DisplayRow[] = [];
    const batchMap = new Map<string, JournalEntryWithUnderlying[]>();

    // Group entries by batch_id
    for (const entry of filteredAndSortedEntries) {
      if (entry.batchId) {
        const existing = batchMap.get(entry.batchId) || [];
        existing.push(entry);
        batchMap.set(entry.batchId, existing);
      } else {
        // No batch - add as single entry
        rows.push({ type: 'single', entry });
      }
    }

    // Convert batch groups to display rows
    for (const [batchId, batchEntries] of batchMap) {
      if (batchEntries.length === 1) {
        // Single entry in batch - treat as individual
        rows.push({ type: 'single', entry: batchEntries[0] });
      } else {
        // Multiple entries - create batch summary
        const actionTypeCounts = new Map<string, number>();
        for (const e of batchEntries) {
          actionTypeCounts.set(e.actionType, (actionTypeCounts.get(e.actionType) || 0) + 1);
        }
        const actionTypes = Array.from(actionTypeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([type]) => type);

        const allUnderlyings = new Set<string>();
        for (const e of batchEntries) {
          for (const t of e.underlyingTickers) {
            allUnderlyings.add(t);
          }
        }

        const summary: BatchSummary = {
          timestamp: new Date(Math.max(...batchEntries.map(e => new Date(e.timestamp).getTime()))),
          objectTitle: batchEntries[0].objectTitle || 'Multiple items',
          objectType: batchEntries[0].objectType,
          actionTypes,
          totalCount: batchEntries.length,
          source: batchEntries[0].source,
          underlyingTickers: Array.from(allUnderlyings),
        };

        rows.push({ type: 'batch', batchId, entries: batchEntries, summary });
      }
    }

    // Sort rows by timestamp (using latest timestamp for batches)
    rows.sort((a, b) => {
      const aTime = a.type === 'single'
        ? new Date(a.entry.timestamp).getTime()
        : a.summary.timestamp.getTime();
      const bTime = b.type === 'single'
        ? new Date(b.entry.timestamp).getTime()
        : b.summary.timestamp.getTime();

      return sortDirection === 'desc' ? bTime - aTime : aTime - bTime;
    });

    return rows;
  }, [filteredAndSortedEntries, sortDirection]);

  const toggleBatch = (batchId: string) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

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
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const getObjectTypeUrl = (objectType: string, objectId: string): string | null => {
    switch (objectType) {
      case 'macro_thesis':
        return `/macro-theses/${objectId}`;
      case 'asset_thesis':
        return `/asset-theses/${objectId}`;
      case 'strategy':
        return `/strategies/${objectId}`;
      case 'claim':
        return `/claims/${objectId}`;
      case 'position':
        return `/positions?id=${objectId}`;
      case 'signal':
      case 'validation_point':
        return null; // Signals don't have their own page yet
      default:
        return null;
    }
  };

  const getObjectTypeBadgeColor = (objectType: string) => {
    switch (objectType) {
      case 'macro_thesis':
        return 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
      case 'asset_thesis':
        return 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
      case 'strategy':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800';
      case 'claim':
        return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
      case 'position':
        return 'bg-slate-50 text-foreground border border-slate-200 dark:bg-slate-800/30 dark:text-slate-300 dark:border-slate-700';
      case 'signal':
      case 'validation_point':
        return 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800';
      default:
        return 'bg-slate-50 text-foreground border border-slate-200 dark:bg-slate-800/30 dark:text-slate-300 dark:border-slate-700';
    }
  };

  const getActionTypeBadgeColor = (actionType: string) => {
    if (actionType.includes('CREATED')) {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800';
    }
    if (actionType.includes('UPDATED') || actionType.includes('CHANGED')) {
      return 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
    }
    if (actionType.includes('DELETED')) {
      return 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
    }
    if (actionType.includes('LINKED')) {
      return 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
    }
    if (actionType.includes('TRIGGERED')) {
      return 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
    }
    return 'bg-slate-50 text-foreground border border-slate-200 dark:bg-slate-800/30 dark:text-slate-300 dark:border-slate-700';
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'user':
        return 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
      case 'skill':
        return 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
      case 'automation':
        return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
      default:
        return 'bg-slate-50 text-foreground border border-slate-200 dark:bg-slate-800/30 dark:text-slate-300 dark:border-slate-700';
    }
  };

  const formatObjectType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatActionType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const renderSingleEntry = (entry: JournalEntryWithUnderlying) => {
    const isExpanded = expandedEntry === entry.id;
    const objectUrl = getObjectTypeUrl(entry.objectType, entry.objectId);
    const rationale = entry.rationale as string | null;
    const metadata = entry.metadata as Record<string, unknown> | null;

    return (
      <Fragment key={entry.id}>
        {/* Main Row */}
        <tr className="border-b hover:bg-muted transition-colors">
          {/* Timestamp */}
          <td className="px-4 py-3 whitespace-nowrap">
            <div className="space-y-0.5">
              <div className="text-foreground text-xs">
                {formatDate(new Date(entry.timestamp))}
              </div>
              <div className="text-muted-foreground text-xs">
                {formatTime(new Date(entry.timestamp))}
              </div>
            </div>
          </td>

          {/* Object Type */}
          <td className="px-4 py-3">
            <Badge className={`${getObjectTypeBadgeColor(entry.objectType)} text-xs`}>
              {formatObjectType(entry.objectType)}
            </Badge>
          </td>

          {/* Title / Description */}
          <td className="px-4 py-3">
            <div className="space-y-1">
              {entry.objectTitle && (
                <div className="flex items-center gap-2">
                  {objectUrl ? (
                    <Link
                      href={objectUrl}
                      className="text-foreground font-medium hover:text-blue-600 hover:underline transition-colors line-clamp-1"
                    >
                      {entry.objectTitle}
                    </Link>
                  ) : (
                    <span className="text-foreground font-medium line-clamp-1">
                      {entry.objectTitle}
                    </span>
                  )}
                  {entry.underlyingTickers.length > 0 && (
                    <span className="flex gap-1 flex-wrap">
                      {entry.underlyingTickers.slice(0, 3).map((ticker) => (
                        <Badge key={ticker} className="bg-slate-100 text-muted-foreground text-xs font-mono">
                          {ticker}
                        </Badge>
                      ))}
                      {entry.underlyingTickers.length > 3 && (
                        <Badge className="bg-slate-100 text-muted-foreground text-xs">
                          +{entry.underlyingTickers.length - 3}
                        </Badge>
                      )}
                    </span>
                  )}
                  {objectUrl && (
                    <Link href={objectUrl} className="text-muted-foreground hover:text-blue-600">
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
              <div className="text-muted-foreground text-xs line-clamp-2">
                {entry.actionDescription}
              </div>
            </div>
          </td>

          {/* Action Type */}
          <td className="px-4 py-3 text-center">
            <Badge className={`${getActionTypeBadgeColor(entry.actionType)} text-xs`}>
              {formatActionType(entry.actionType)}
            </Badge>
          </td>

          {/* Source */}
          <td className="px-4 py-3 text-center">
            <Badge className={`${getSourceBadgeColor(entry.source)} text-xs`}>
              {entry.source}
            </Badge>
            {entry.skillInvoked && (
              <div className="text-xs text-muted-foreground mt-1 font-mono">
                {entry.skillInvoked}
              </div>
            )}
          </td>

          {/* Expand/Collapse */}
          <td className="px-4 py-3 text-right">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
              className="gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  More
                </>
              )}
            </Button>
          </td>
        </tr>

        {/* Expanded Row */}
        {isExpanded && (
          <tr className="bg-muted border-b">
            <td colSpan={6} className="px-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* State Changes */}
                <div>
                  <h4 className="text-xs font-medium text-foreground uppercase tracking-wide mb-2">
                    State Changes
                  </h4>
                  <div className="bg-card rounded-lg border border p-3">
                    {renderStateChanges(entry)}
                  </div>
                </div>

                {/* Additional Info */}
                <div className="space-y-4">
                  {/* Rationale */}
                  {rationale ? (
                    <div>
                      <h4 className="text-xs font-medium text-foreground uppercase tracking-wide mb-2">
                        Rationale
                      </h4>
                      <div className="bg-card rounded-lg border border p-3 text-sm text-muted-foreground">
                        {rationale}
                      </div>
                    </div>
                  ) : null}

                  {/* Metadata */}
                  {metadata && Object.keys(metadata).length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-foreground uppercase tracking-wide mb-2">
                        Metadata
                      </h4>
                      <div className="bg-card rounded-lg border border p-3">
                        <pre className="text-xs text-muted-foreground overflow-auto">
                          {JSON.stringify(metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* IDs */}
                  <div>
                    <h4 className="text-xs font-medium text-foreground uppercase tracking-wide mb-2">
                      References
                    </h4>
                    <div className="bg-card rounded-lg border border p-3 space-y-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">Entry ID:</span>{' '}
                        <code className="font-mono text-foreground">{entry.id}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Object ID:</span>{' '}
                        <code className="font-mono text-foreground">{entry.objectId}</code>
                      </div>
                      {entry.triageRecordId && (
                        <div>
                          <span className="text-muted-foreground">Triage ID:</span>{' '}
                          <code className="font-mono text-foreground">{entry.triageRecordId}</code>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const renderBatchRow = (row: Extract<DisplayRow, { type: 'batch' }>) => {
    const { batchId, entries: batchEntries, summary } = row;
    const isExpanded = expandedBatches.has(batchId);
    const objectUrl = getObjectTypeUrl(summary.objectType, batchEntries[0].objectId);

    // Create a summary description based on action types
    const actionSummary = summary.actionTypes
      .map(type => {
        const count = batchEntries.filter(e => e.actionType === type).length;
        return `${count} ${formatActionType(type).toLowerCase()}`;
      })
      .join(', ');

    return (
      <Fragment key={batchId}>
        {/* Batch Summary Row */}
        <tr
          className="border-b hover:bg-blue-50 transition-colors cursor-pointer bg-blue-50/30"
          onClick={() => toggleBatch(batchId)}
        >
          {/* Timestamp */}
          <td className="px-4 py-3 whitespace-nowrap">
            <div className="space-y-0.5">
              <div className="text-foreground text-xs">
                {formatDate(summary.timestamp)}
              </div>
              <div className="text-muted-foreground text-xs">
                {formatTime(summary.timestamp)}
              </div>
            </div>
          </td>

          {/* Object Type */}
          <td className="px-4 py-3">
            <Badge className={`${getObjectTypeBadgeColor(summary.objectType)} text-xs`}>
              {formatObjectType(summary.objectType)}
            </Badge>
          </td>

          {/* Title / Description */}
          <td className="px-4 py-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {objectUrl ? (
                  <Link
                    href={objectUrl}
                    className="text-foreground font-medium hover:text-blue-600 hover:underline transition-colors line-clamp-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {summary.objectTitle}
                  </Link>
                ) : (
                  <span className="text-foreground font-medium line-clamp-1">
                    {summary.objectTitle}
                  </span>
                )}
                <Badge className="bg-blue-100 text-blue-700 text-xs">
                  {summary.totalCount} entries
                </Badge>
                {summary.underlyingTickers.length > 0 && (
                  <span className="flex gap-1 flex-wrap">
                    {summary.underlyingTickers.slice(0, 2).map((ticker) => (
                      <Badge key={ticker} className="bg-slate-100 text-muted-foreground text-xs font-mono">
                        {ticker}
                      </Badge>
                    ))}
                    {summary.underlyingTickers.length > 2 && (
                      <Badge className="bg-slate-100 text-muted-foreground text-xs">
                        +{summary.underlyingTickers.length - 2}
                      </Badge>
                    )}
                  </span>
                )}
              </div>
              <div className="text-muted-foreground text-xs">
                Batch: {actionSummary}
              </div>
            </div>
          </td>

          {/* Action Type - show badges for each type */}
          <td className="px-4 py-3 text-center">
            <div className="flex flex-wrap gap-1 justify-center">
              {summary.actionTypes.slice(0, 2).map((type) => (
                <Badge key={type} className={`${getActionTypeBadgeColor(type)} text-xs`}>
                  {formatActionType(type)}
                </Badge>
              ))}
              {summary.actionTypes.length > 2 && (
                <Badge className="bg-slate-100 text-muted-foreground text-xs">
                  +{summary.actionTypes.length - 2}
                </Badge>
              )}
            </div>
          </td>

          {/* Source */}
          <td className="px-4 py-3 text-center">
            <Badge className={`${getSourceBadgeColor(summary.source)} text-xs`}>
              {summary.source}
            </Badge>
          </td>

          {/* Expand/Collapse */}
          <td className="px-4 py-3 text-right">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Expand
                </>
              )}
            </Button>
          </td>
        </tr>

        {/* Expanded Batch Entries */}
        {isExpanded && batchEntries.map((entry) => (
          <tr key={entry.id} className="border-b bg-muted/50 hover:bg-accent transition-colors">
            {/* Timestamp - indented */}
            <td className="px-4 py-2 whitespace-nowrap pl-8">
              <div className="text-muted-foreground text-xs">
                {formatTime(new Date(entry.timestamp))}
              </div>
            </td>

            {/* Object Type - empty for nested */}
            <td className="px-4 py-2">
              <div className="w-2 h-2 rounded-full bg-slate-300 ml-4" />
            </td>

            {/* Description */}
            <td className="px-4 py-2">
              <div className="text-muted-foreground text-xs line-clamp-2">
                {entry.actionDescription}
              </div>
            </td>

            {/* Action Type */}
            <td className="px-4 py-2 text-center">
              <Badge className={`${getActionTypeBadgeColor(entry.actionType)} text-xs`}>
                {formatActionType(entry.actionType)}
              </Badge>
            </td>

            {/* Source - empty for nested */}
            <td className="px-4 py-2" />

            {/* Details button */}
            <td className="px-4 py-2 text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                className="gap-1 text-xs"
              >
                {expandedEntry === entry.id ? 'Hide' : 'Details'}
              </Button>
            </td>
          </tr>
        ))}

        {/* Expanded entry details (when a batch entry's details are shown) */}
        {isExpanded && batchEntries.map((entry) => {
          if (expandedEntry !== entry.id) return null;
          const metadata = entry.metadata as Record<string, unknown> | null;
          const rationale = entry.rationale as string | null;

          return (
            <tr key={`${entry.id}-details`} className="bg-slate-100 border-b">
              <td colSpan={6} className="px-4 py-4 pl-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* State Changes */}
                  <div>
                    <h4 className="text-xs font-medium text-foreground uppercase tracking-wide mb-2">
                      State Changes
                    </h4>
                    <div className="bg-card rounded-lg border border p-3">
                      {renderStateChanges(entry)}
                    </div>
                  </div>

                  {/* Additional Info */}
                  <div className="space-y-3">
                    {rationale && (
                      <div>
                        <h4 className="text-xs font-medium text-foreground uppercase tracking-wide mb-2">
                          Rationale
                        </h4>
                        <div className="bg-card rounded-lg border border p-3 text-sm text-muted-foreground">
                          {rationale}
                        </div>
                      </div>
                    )}
                    {metadata && Object.keys(metadata).length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-foreground uppercase tracking-wide mb-2">
                          Metadata
                        </h4>
                        <div className="bg-card rounded-lg border border p-3">
                          <pre className="text-xs text-muted-foreground overflow-auto">
                            {JSON.stringify(metadata, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          );
        })}
      </Fragment>
    );
  };

  const renderStateChanges = (entry: JournalEntry) => {
    const { previousState, newState } = entry;

    if (!previousState && !newState) {
      return <span className="text-muted-foreground text-xs">No state changes recorded</span>;
    }

    // Cast to record type for accessing properties
    const prevState = (previousState || {}) as Record<string, unknown>;
    const nextState = (newState || {}) as Record<string, unknown>;

    // Get all keys from both states
    const allKeys = new Set([
      ...Object.keys(prevState),
      ...Object.keys(nextState),
    ]);

    return (
      <div className="space-y-2">
        {Array.from(allKeys).map((key) => {
          const prev = prevState[key];
          const next = nextState[key];
          const hasChanged = JSON.stringify(prev) !== JSON.stringify(next);

          if (!hasChanged && !prev && !next) return null;

          return (
            <div key={key} className="flex items-start gap-2 text-xs">
              <span className="font-medium text-muted-foreground min-w-[80px]">{key}:</span>
              {hasChanged ? (
                <div className="flex items-center gap-2">
                  <span className="text-red-600 line-through">
                    {prev !== undefined ? JSON.stringify(prev) : '(none)'}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-emerald-600">
                    {next !== undefined ? JSON.stringify(next) : '(none)'}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">{JSON.stringify(prev)}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Quick Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
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

        {/* Object Type Quick Filters */}
        {objectTypes.length > 1 && (() => {
          const typeOrder = ['claim', 'macro_thesis', 'asset_thesis', 'strategy', 'position', 'signal', 'validation_point'];
          const sorted = [...objectTypes].sort((a, b) => {
            const ai = typeOrder.indexOf(a);
            const bi = typeOrder.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          });
          return (
            <div className="inline-flex rounded-md shadow-sm">
              <Button
                variant={objectTypeFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setObjectTypeFilter('all')}
                className="rounded-r-none border-r-0"
              >
                All Types
              </Button>
              {sorted.map((type, i) => (
                <Button
                  key={type}
                  variant={objectTypeFilter === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setObjectTypeFilter(type)}
                  className={i < sorted.length - 1 ? 'rounded-none border-r-0' : 'rounded-l-none'}
                >
                  {formatObjectType(type)}
                </Button>
              ))}
            </div>
          );
        })()}

        <div className="ml-auto text-sm text-muted-foreground">
          {isLoading ? (
            <span className="animate-pulse">Loading...</span>
          ) : (
            <>Showing {filteredAndSortedEntries.length} of {totalCount} entries</>
          )}
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
              placeholder="Search titles, descriptions, skills... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Object Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Object Type</label>
              <select
                value={objectTypeFilter}
                onChange={(e) => setObjectTypeFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                {objectTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatObjectType(type)}
                  </option>
                ))}
              </select>
            </div>

            {/* Action Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Action Type</label>
              <select
                value={actionTypeFilter}
                onChange={(e) => setActionTypeFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Actions</option>
                {actionTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatActionType(type)}
                  </option>
                ))}
              </select>
            </div>

            {/* Source */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Source</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Sources</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {source.charAt(0).toUpperCase() + source.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Underlying */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Underlying</label>
              <select
                value={underlyingFilter}
                onChange={(e) => setUnderlyingFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Underlyings</option>
                {underlyings.map((underlying) => (
                  <option key={underlying} value={underlying}>
                    {underlying}
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
                setObjectTypeFilter('all');
                setActionTypeFilter('all');
                setSourceFilter('all');
                setUnderlyingFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Journal Table */}
      <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedEntries.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No journal entries match the selected filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('timestamp')}
                  >
                    <div className="flex items-center gap-2">
                      Time
                      {getSortIcon('timestamp')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('objectType')}
                  >
                    <div className="flex items-center gap-2">
                      Object
                      {getSortIcon('objectType')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors w-1/3"
                    onClick={() => handleSort('objectTitle')}
                  >
                    <div className="flex items-center gap-2">
                      Title / Description
                      {getSortIcon('objectTitle')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('actionType')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Action
                      {getSortIcon('actionType')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('source')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Source
                      {getSortIcon('source')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  if (row.type === 'single') {
                    return renderSingleEntry(row.entry);
                  } else {
                    return renderBatchRow(row);
                  }
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
