'use client';

import { useState, useMemo, useRef, useEffect, Fragment } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertTriangle,
  Target,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Lightbulb,
  FolderKanban,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SignalProgressCard } from './SignalProgressCard';
import { SignalTrendIndicator } from './SignalTrendIndicator';
import type { SignalWithContext, SignalFilterCounts } from '@/db/queries/signals';

type StatusFilter = 'all' | 'active' | 'complete' | 'draft' | 'rejected';
type TypeFilter = 'all' | 'confirmation' | 'warning' | 'completion';
type EntityFilter = 'all' | 'thesis' | 'strategy';
type SortColumn = 'statement' | 'type' | 'entity' | 'status' | 'trend' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

interface SignalsBrowserProps {
  signals: SignalWithContext[];
  counts: SignalFilterCounts;
}

// -- Helpers --

function typeLabel(type: string) {
  switch (type) {
    case 'confirmation': return 'Confirmation';
    case 'warning': return 'Invalidation';
    case 'completion': return 'Completion';
    default: return type;
  }
}

function typeBadgeColor(type: string) {
  switch (type) {
    case 'confirmation': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
    case 'warning': return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
    case 'completion': return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300';
    default: return 'bg-slate-100 text-foreground';
  }
}

function typeIcon(type: string) {
  switch (type) {
    case 'confirmation': return <CheckCircle2 className="h-3 w-3" />;
    case 'warning': return <AlertTriangle className="h-3 w-3" />;
    case 'completion': return <Target className="h-3 w-3" />;
    default: return null;
  }
}

function statusBadgeColor(status: string) {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300';
    case 'complete': return 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300';
    case 'draft': return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    case 'rejected': return 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300';
    default: return 'bg-slate-100 text-foreground';
  }
}

function entityTypeIcon(entityType: string, thesisType: string | null) {
  if (entityType === 'strategy') return <FolderKanban className="h-3 w-3 text-muted-foreground" />;
  if (thesisType === 'macro') return <TrendingUp className="h-3 w-3 text-muted-foreground" />;
  return <Lightbulb className="h-3 w-3 text-muted-foreground" />;
}

function entityLink(signal: SignalWithContext): string | null {
  if (signal.entityType === 'strategy' && signal.strategyId) {
    return `/strategies/${signal.strategyId}`;
  }
  if (signal.thesisType === 'macro' && signal.thesisId) {
    return `/macro-theses/${signal.thesisId}`;
  }
  if (signal.thesisType === 'asset' && signal.thesisId) {
    return `/asset-theses/${signal.thesisId}`;
  }
  return null;
}

function entityTypeBadge(entityType: string, thesisType: string | null) {
  if (entityType === 'strategy') return 'Strategy';
  if (thesisType === 'macro') return 'Macro';
  return 'Asset';
}

export function SignalsBrowser({ signals, counts }: SignalsBrowserProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Sort
  const [sortColumn, setSortColumn] = useState<SortColumn>('trend');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        if (!showFilters) setShowFilters(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showFilters]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = signals;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(s => s.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter(s => s.type === typeFilter);
    }

    // Entity filter
    if (entityFilter !== 'all') {
      result = result.filter(s => s.entityType === entityFilter);
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.statement.toLowerCase().includes(q) ||
        (s.entityTitle?.toLowerCase().includes(q)) ||
        (s.ticker?.toLowerCase().includes(q)) ||
        (s.strategyKey?.toLowerCase().includes(q))
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'statement':
          cmp = a.statement.localeCompare(b.statement);
          break;
        case 'type':
          cmp = a.type.localeCompare(b.type);
          break;
        case 'entity':
          cmp = (a.entityTitle || '').localeCompare(b.entityTitle || '');
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'trend': {
          const aPct = a.latestPctToThreshold ? parseFloat(a.latestPctToThreshold) : -1;
          const bPct = b.latestPctToThreshold ? parseFloat(b.latestPctToThreshold) : -1;
          cmp = aPct - bPct;
          break;
        }
        case 'updatedAt':
          cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [signals, statusFilter, typeFilter, entityFilter, searchQuery, sortColumn, sortDirection]);

  function toggleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection(col === 'trend' ? 'desc' : 'asc');
    }
  }

  function SortIcon({ col }: { col: SortColumn }) {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 text-foreground" />
      : <ArrowDown className="h-3 w-3 text-foreground" />;
  }

  // Count for active filter context
  const statusCounts: Record<StatusFilter, number> = {
    all: counts.total,
    active: counts.active,
    complete: counts.complete,
    draft: counts.draft,
    rejected: counts.rejected,
  };

  return (
    <div className="space-y-3">
      {/* Quick filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'active', 'complete'] as StatusFilter[]).map(f => (
          <Button
            key={f}
            variant={statusFilter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(f)}
            className="text-xs"
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1 opacity-60">({statusCounts[f]})</span>
          </Button>
        ))}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFilters(v => !v)}
          className="text-xs gap-1"
        >
          <Filter className="h-3 w-3" />
          Filters
        </Button>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-lg border">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search signals, entities, tickers..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background"
            />
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          >
            <option value="all">All Types</option>
            <option value="confirmation">Confirmation ({counts.confirmation})</option>
            <option value="warning">Invalidation ({counts.invalidation})</option>
            <option value="completion">Completion ({counts.completion})</option>
          </select>

          {/* Entity type filter */}
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value as EntityFilter)}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          >
            <option value="all">All Entities</option>
            <option value="thesis">Thesis ({counts.thesis})</option>
            <option value="strategy">Strategy ({counts.strategy})</option>
          </select>

          {searchQuery || typeFilter !== 'all' || entityFilter !== 'all' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearchQuery(''); setTypeFilter('all'); setEntityFilter('all'); }}
              className="text-xs"
            >
              Clear
            </Button>
          ) : null}
        </div>
      )}

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {counts.total} signals
      </p>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-8 px-2" />
              <th className="px-3 py-2 text-left">
                <button onClick={() => toggleSort('type')} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  TYPE <SortIcon col="type" />
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button onClick={() => toggleSort('statement')} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  STATEMENT <SortIcon col="statement" />
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button onClick={() => toggleSort('entity')} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  ENTITY <SortIcon col="entity" />
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  STATUS <SortIcon col="status" />
                </button>
              </th>
              <th className="px-3 py-2 text-right">
                <button onClick={() => toggleSort('trend')} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground ml-auto">
                  PROGRESS <SortIcon col="trend" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No signals match the current filters.
                </td>
              </tr>
            )}
            {filtered.map(signal => {
              const isExpanded = expandedId === signal.id;
              const link = entityLink(signal);
              const pct = signal.latestPctToThreshold ? parseFloat(signal.latestPctToThreshold) : null;

              return (
                <Fragment key={signal.id}>
                  <tr
                    className={`border-b cursor-pointer transition-colors hover:bg-muted/30 ${isExpanded ? 'bg-muted/20' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : signal.id)}
                  >
                    {/* Chevron */}
                    <td className="px-2 py-3 text-center">
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                    </td>

                    {/* Type badge */}
                    <td className="px-3 py-3">
                      <Badge className={`gap-1 text-xs font-normal ${typeBadgeColor(signal.type)}`}>
                        {typeIcon(signal.type)}
                        {typeLabel(signal.type)}
                      </Badge>
                    </td>

                    {/* Statement */}
                    <td className="px-3 py-3">
                      <p className="text-sm line-clamp-2">{signal.statement}</p>
                    </td>

                    {/* Entity */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {entityTypeIcon(signal.entityType, signal.thesisType)}
                        {link ? (
                          <Link
                            href={link}
                            onClick={e => e.stopPropagation()}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px]"
                          >
                            {signal.entityTitle || 'Unknown'}
                          </Link>
                        ) : (
                          <span className="text-sm truncate max-w-[200px]">{signal.entityTitle || 'Unknown'}</span>
                        )}
                        {signal.ticker && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">
                            {signal.ticker}
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3">
                      <Badge className={`text-xs font-normal ${statusBadgeColor(signal.status)}`}>
                        {signal.status}
                      </Badge>
                    </td>

                    {/* Trend / Progress */}
                    <td className="px-3 py-3 text-right">
                      <SignalTrendIndicator
                        pctToThreshold={pct}
                        signalType={signal.type}
                        assessment={signal.latestAssessment}
                      />
                    </td>
                  </tr>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <tr className="bg-muted/10">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="max-w-2xl">
                          <SignalProgressCard
                            signal={{
                              id: signal.id,
                              entityType: signal.entityType,
                              type: signal.type,
                              statement: signal.statement,
                              status: signal.status,
                              category: signal.category,
                              importance: signal.importance,
                              notes: signal.notes,
                              explicitDetails: signal.explicitDetails,
                              thesisId: signal.thesisId,
                              thesisType: signal.thesisType,
                              strategyId: signal.strategyId,
                              createdAt: signal.createdAt,
                              updatedAt: signal.updatedAt,
                            } as any}
                          />
                          {link && (
                            <div className="mt-2">
                              <Link
                                href={link}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                View {entityTypeBadge(signal.entityType, signal.thesisType)} →
                              </Link>
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
      </div>
    </div>
  );
}
