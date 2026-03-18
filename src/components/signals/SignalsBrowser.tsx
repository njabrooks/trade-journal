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
  Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SignalProgressCard } from './SignalProgressCard';
import { SignalTrendIndicator } from './SignalTrendIndicator';
import type { SignalWithContext, SignalFilterCounts, SignalEntityInfo } from '@/db/queries/signals';

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

function entityTypeIcon(entity: SignalEntityInfo) {
  if (entity.entityType === 'strategy') return <FolderKanban className="h-3 w-3 text-muted-foreground" />;
  if (entity.thesisType === 'macro') return <TrendingUp className="h-3 w-3 text-muted-foreground" />;
  return <Lightbulb className="h-3 w-3 text-muted-foreground" />;
}

function entityTypeBadgeLabel(entity: SignalEntityInfo) {
  if (entity.entityType === 'strategy') return 'Strategy';
  if (entity.thesisType === 'macro') return 'Macro';
  return 'Asset';
}

// Entity type sort order for grouped view
function entitySortOrder(e: SignalEntityInfo): number {
  if (e.entityType === 'strategy') return 0;
  if (e.thesisType === 'asset') return 1;
  return 2;
}

// Render a compact entity list for a signal
function EntitiesList({ entities, compact }: { entities: SignalEntityInfo[]; compact?: boolean }) {
  if (entities.length === 0) {
    return <span className="text-sm text-muted-foreground">No linked entities</span>;
  }

  // Sort: strategies first
  const sorted = [...entities].sort((a, b) => entitySortOrder(a) - entitySortOrder(b));
  const show = compact ? sorted.slice(0, 2) : sorted;
  const remaining = compact ? sorted.length - 2 : 0;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {show.map((entity, i) => (
        <div key={i} className="flex items-center gap-1">
          {entityTypeIcon(entity)}
          {entity.entityLink ? (
            <Link
              href={entity.entityLink}
              onClick={e => e.stopPropagation()}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[140px]"
            >
              {entity.entityTitle || 'Unknown'}
            </Link>
          ) : (
            <span className="text-sm truncate max-w-[140px]">{entity.entityTitle || 'Unknown'}</span>
          )}
          {entity.positionPct != null && (
            <span className="text-[10px] text-muted-foreground">({entity.positionPct}%)</span>
          )}
          {i < show.length - 1 && <span className="text-muted-foreground text-[10px]">,</span>}
        </div>
      ))}
      {remaining > 0 && (
        <span className="text-[10px] text-muted-foreground">+{remaining} more</span>
      )}
    </div>
  );
}

export function SignalsBrowser({ signals, counts }: SignalsBrowserProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [groupByUnderlying, setGroupByUnderlying] = useState(true);

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

    if (statusFilter !== 'all') {
      result = result.filter(s => s.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter(s => s.type === typeFilter);
    }
    if (entityFilter !== 'all') {
      result = result.filter(s => s.entities.some(e => e.entityType === entityFilter));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.statement.toLowerCase().includes(q) ||
        s.entities.some(e =>
          (e.entityTitle?.toLowerCase().includes(q)) ||
          (e.strategyKey?.toLowerCase().includes(q)) ||
          (e.ticker?.toLowerCase().includes(q))
        ) ||
        s.underlyingTickers.some(t => t.toLowerCase().includes(q))
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
          cmp = (a.entities[0]?.entityTitle || '').localeCompare(b.entities[0]?.entityTitle || '');
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

  // Group signals by underlying ticker
  const grouped = useMemo(() => {
    if (!groupByUnderlying) return null;

    const groups = new Map<string, SignalWithContext[]>();

    for (const signal of filtered) {
      const tickers = signal.underlyingTickers.length > 0
        ? signal.underlyingTickers
        : ['Other'];

      for (const ticker of tickers) {
        const group = groups.get(ticker) || [];
        if (!group.some(s => s.id === signal.id)) {
          group.push(signal);
        }
        groups.set(ticker, group);
      }
    }

    const sorted = [...groups.entries()].sort(([a], [b]) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });

    return sorted;
  }, [filtered, groupByUnderlying]);

  function toggleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection(col === 'trend' ? 'desc' : 'asc');
    }
  }

  function toggleGroup(ticker: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }

  function SortIcon({ col }: { col: SortColumn }) {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 text-foreground" />
      : <ArrowDown className="h-3 w-3 text-foreground" />;
  }

  const statusCounts: Record<StatusFilter, number> = {
    all: counts.total,
    active: counts.active,
    complete: counts.complete,
    draft: counts.draft,
    rejected: counts.rejected,
  };

  function renderSignalRow(signal: SignalWithContext) {
    const isExpanded = expandedId === signal.id;
    const pct = signal.latestPctToThreshold ? parseFloat(signal.latestPctToThreshold) : null;
    const firstLink = signal.entities.find(e => e.entityLink)?.entityLink;

    return (
      <Fragment key={signal.id}>
        <tr
          className={`border-b cursor-pointer transition-colors hover:bg-muted/30 ${isExpanded ? 'bg-muted/20' : ''}`}
          onClick={() => setExpandedId(isExpanded ? null : signal.id)}
        >
          <td className="px-2 py-3 text-center">
            {isExpanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            }
          </td>
          <td className="px-3 py-3">
            <Badge className={`gap-1 text-xs font-normal ${typeBadgeColor(signal.type)}`}>
              {typeIcon(signal.type)}
              {typeLabel(signal.type)}
            </Badge>
          </td>
          <td className="px-3 py-3">
            <p className="text-sm line-clamp-2">{signal.statement}</p>
          </td>
          <td className="px-3 py-3">
            <EntitiesList entities={signal.entities} compact />
          </td>
          <td className="px-3 py-3">
            <Badge className={`text-xs font-normal ${statusBadgeColor(signal.status)}`}>
              {signal.status}
            </Badge>
          </td>
          <td className="px-3 py-3 text-right">
            <SignalTrendIndicator
              pctToThreshold={pct}
              signalType={signal.type}
              assessment={signal.latestAssessment}
            />
          </td>
        </tr>
        {isExpanded && (
          <tr className="bg-muted/10">
            <td colSpan={6} className="px-6 py-4">
              <div className="max-w-4xl space-y-3">
                <SignalProgressCard
                  signal={{
                    id: signal.id,
                    entityType: signal.entities[0]?.entityType || 'thesis',
                    type: signal.type,
                    statement: signal.statement,
                    status: signal.status,
                    category: signal.category,
                    importance: signal.importance,
                    notes: signal.notes,
                    explicitDetails: signal.explicitDetails,
                    thesisId: signal.entities[0]?.thesisId || null,
                    thesisType: signal.entities[0]?.thesisType || null,
                    strategyId: signal.entities[0]?.strategyId || null,
                    createdAt: signal.createdAt,
                    updatedAt: signal.updatedAt,
                  } as any}
                />
                {/* Linked entities with position % */}
                {signal.entities.length > 0 && (
                  <div className="border border-border rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Linked to {signal.entities.length} {signal.entities.length === 1 ? 'entity' : 'entities'}
                    </p>
                    <EntitiesList entities={signal.entities} />
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

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
          variant={groupByUnderlying ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGroupByUnderlying(v => !v)}
          className="text-xs gap-1"
        >
          <Layers className="h-3 w-3" />
          Group
        </Button>

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
        {groupByUnderlying && grouped ? ` across ${grouped.length} underlyings` : ''}
      </p>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
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
                  ENTITIES <SortIcon col="entity" />
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

            {groupByUnderlying && grouped ? (
              grouped.map(([ticker, groupSignals]) => {
                const isCollapsed = collapsedGroups.has(ticker);
                return (
                  <Fragment key={`group-${ticker}`}>
                    <tr
                      className="bg-muted/30 border-b cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleGroup(ticker)}
                    >
                      <td className="px-2 py-2 text-center">
                        {isCollapsed
                          ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        }
                      </td>
                      <td colSpan={5} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold font-mono">{ticker}</span>
                          <span className="text-xs text-muted-foreground">
                            {groupSignals.length} signal{groupSignals.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed && groupSignals.map(renderSignalRow)}
                  </Fragment>
                );
              })
            ) : (
              filtered.map(renderSignalRow)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
