'use client';

import { useState, useMemo, useRef, useEffect, Fragment } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Target,
  Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SignalProgressCard } from './SignalProgressCard';
import { SignalTrendIndicator } from './SignalTrendIndicator';
import type { SignalWithContext, SignalFilterCounts, SignalEntityInfo } from '@/db/queries/signals';

type StatusFilter = 'all' | 'active' | 'complete' | 'draft' | 'rejected';
type TypeFilter = 'all' | 'confirmation' | 'invalidation' | 'completion';
type EntityFilter = 'all' | 'macro_thesis' | 'asset_thesis' | 'strategy';
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
    case 'invalidation':
    case 'warning':      return 'Invalidation';
    case 'completion':   return 'Completion';
    default: return type;
  }
}

function typeBadgeColor(type: string) {
  switch (type) {
    case 'confirmation': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
    case 'invalidation':
    case 'warning':      return 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300';
    case 'completion':   return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300';
    default: return 'bg-slate-100 text-foreground';
  }
}

function typeIcon(type: string) {
  switch (type) {
    case 'confirmation': return <CheckCircle2 className="h-3 w-3" />;
    case 'invalidation':
    case 'warning':      return <AlertTriangle className="h-3 w-3" />;
    case 'completion':   return <Target className="h-3 w-3" />;
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

function entityTypeBadgeLabel(entity: SignalEntityInfo) {
  if (entity.entityType === 'strategy') return 'Strategy';
  if (entity.thesisType === 'macro') return 'Macro Thesis';
  return 'Asset Thesis';
}

function entityTypeBadgeColor(entity: SignalEntityInfo) {
  if (entity.entityType === 'strategy') return 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300';
  if (entity.thesisType === 'macro') return 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300';
  return 'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300';
}

// Entity type sort order for grouped view
function entitySortOrder(e: SignalEntityInfo): number {
  if (e.entityType === 'strategy') return 0;
  if (e.thesisType === 'asset') return 1;
  return 2;
}

// Show distinct entity-type badges only (no entity names/links)
function EntityTypeBadges({ entities }: { entities: SignalEntityInfo[] }) {
  if (entities.length === 0) return null;
  // Deduplicate by label
  const seen = new Set<string>();
  const unique: SignalEntityInfo[] = [];
  for (const e of entities) {
    const label = entityTypeBadgeLabel(e);
    if (!seen.has(label)) { seen.add(label); unique.push(e); }
  }
  return (
    <div className="flex flex-wrap gap-1">
      {unique.map((entity, i) => (
        <Badge key={i} className={`text-[10px] font-normal px-1.5 py-0 ${entityTypeBadgeColor(entity)}`}>
          {entityTypeBadgeLabel(entity)}
        </Badge>
      ))}
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
      result = result.filter(s => s.entities.some(e => {
        if (entityFilter === 'macro_thesis') return e.entityType === 'thesis' && e.thesisType === 'macro';
        if (entityFilter === 'asset_thesis') return e.entityType === 'thesis' && e.thesisType === 'asset';
        return e.entityType === 'strategy';
      }));
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

  // Classify a signal as macro thesis, asset thesis, or strategy based on its linked entities
  function signalEntityKind(signal: SignalWithContext): 'macro_thesis' | 'asset_thesis' | 'strategy' {
    // A signal linked to a macro thesis is macro (even if also linked to strategies)
    if (signal.entities.some(e => e.entityType === 'thesis' && e.thesisType === 'macro')) return 'macro_thesis';
    if (signal.entities.some(e => e.entityType === 'strategy')) return 'strategy';
    return 'asset_thesis';
  }

  // Group signals: macro theses in own section, asset thesis + strategy grouped by underlying
  const grouped = useMemo(() => {
    if (!groupByUnderlying) return null;

    // Separate macro thesis signals from underlying-scoped signals
    const macroGroups = new Map<string, { title: string; thesisId: string; signals: SignalWithContext[] }>();
    const underlyingGroups = new Map<string, SignalWithContext[]>();

    for (const signal of filtered) {
      const kind = signalEntityKind(signal);

      if (kind === 'macro_thesis') {
        // Group by macro thesis title
        const macroEntity = signal.entities.find(e => e.entityType === 'thesis' && e.thesisType === 'macro');
        const key = macroEntity?.thesisId || 'unknown';
        const existing = macroGroups.get(key) || {
          title: macroEntity?.entityTitle || 'Unknown Macro Thesis',
          thesisId: key,
          signals: [],
        };
        existing.signals.push(signal);
        macroGroups.set(key, existing);
      } else {
        // Group by underlying ticker
        const tickers = signal.underlyingTickers.length > 0
          ? signal.underlyingTickers
          : ['Other'];

        for (const ticker of tickers) {
          const group = underlyingGroups.get(ticker) || [];
          if (!group.some(s => s.id === signal.id)) {
            group.push(signal);
          }
          underlyingGroups.set(ticker, group);
        }
      }
    }

    const sortedMacro = [...macroGroups.values()].sort((a, b) => a.title.localeCompare(b.title));
    const sortedUnderlying = [...underlyingGroups.entries()].sort(([a], [b]) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });

    return { macroGroups: sortedMacro, underlyingGroups: sortedUnderlying };
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

    // All signals link to the standalone detail page
    const signalUrl = `/signals/${signal.id}`;

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
            <Link
              href={signalUrl}
              onClick={e => e.stopPropagation()}
              className="text-sm line-clamp-2 hover:underline text-foreground"
            >
              {signal.statement}
            </Link>
          </td>
          <td className="px-3 py-3">
            <EntityTypeBadges entities={signal.entities} />
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
                    type: signal.type,
                    statement: signal.statement,
                    status: signal.status,
                    category: signal.category,
                    importance: signal.importance,
                    notes: signal.notes,
                    explicitDetails: signal.explicitDetails,
                    createdAt: signal.createdAt,
                    updatedAt: signal.updatedAt,
                  } as any}
                  evidenceCount={signal.evidenceCount}
                />
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
            <option value="invalidation">Invalidation ({counts.invalidation})</option>
            <option value="completion">Completion ({counts.completion})</option>
          </select>
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value as EntityFilter)}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          >
            <option value="all">All Entities</option>
            <option value="macro_thesis">Macro Thesis ({counts.macroThesis})</option>
            <option value="asset_thesis">Asset Thesis ({counts.assetThesis})</option>
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
        {groupByUnderlying && grouped ? (() => {
          const parts: string[] = [];
          if (grouped.macroGroups.length > 0) parts.push(`${grouped.macroGroups.length} macro ${grouped.macroGroups.length === 1 ? 'thesis' : 'theses'}`);
          if (grouped.underlyingGroups.length > 0) parts.push(`${grouped.underlyingGroups.length} ${grouped.underlyingGroups.length === 1 ? 'underlying' : 'underlyings'}`);
          return parts.length > 0 ? ` across ${parts.join(' and ')}` : '';
        })() : ''}
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
              <>
                {/* Macro thesis signals */}
                {grouped.macroGroups.length > 0 && (
                  <>
                    <tr className="bg-muted/60 border-b">
                      <td colSpan={6} className="px-3 py-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Macro Theses
                        </span>
                      </td>
                    </tr>
                    {grouped.macroGroups.map(group => {
                      const groupKey = `macro-${group.thesisId}`;
                      const isCollapsed = collapsedGroups.has(groupKey);
                      const confirmCount = group.signals.filter(s => s.type === 'confirmation').length;
                      const invalidCount = group.signals.filter(s => s.type === 'invalidation' || s.type === 'warning').length;
                      const completionCount = group.signals.filter(s => s.type === 'completion').length;
                      return (
                        <Fragment key={groupKey}>
                          <tr
                            className="bg-muted/30 border-b cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => toggleGroup(groupKey)}
                          >
                            <td className="px-2 py-2 text-center">
                              {isCollapsed
                                ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              }
                            </td>
                            <td colSpan={5} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm font-semibold">{group.title}</span>
                                <span className="text-xs text-muted-foreground">
                                  {group.signals.length} signal{group.signals.length !== 1 ? 's' : ''}
                                </span>
                                <div className="flex items-center gap-1 ml-1">
                                  {confirmCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                      <CheckCircle2 className="h-2.5 w-2.5" />{confirmCount}
                                    </span>
                                  )}
                                  {invalidCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                                      <AlertTriangle className="h-2.5 w-2.5" />{invalidCount}
                                    </span>
                                  )}
                                  {completionCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                                      <Target className="h-2.5 w-2.5" />{completionCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                          {!isCollapsed && group.signals.map(renderSignalRow)}
                        </Fragment>
                      );
                    })}
                  </>
                )}

                {/* Asset thesis + strategy signals grouped by underlying */}
                {grouped.underlyingGroups.length > 0 && (
                  <>
                    {grouped.macroGroups.length > 0 && (
                      <tr className="bg-muted/60 border-b">
                        <td colSpan={6} className="px-3 py-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            By Underlying
                          </span>
                        </td>
                      </tr>
                    )}
                    {grouped.underlyingGroups.map(([ticker, groupSignals]) => {
                      const isCollapsed = collapsedGroups.has(ticker);
                      const confirmCount = groupSignals.filter(s => s.type === 'confirmation').length;
                      const invalidCount = groupSignals.filter(s => s.type === 'invalidation' || s.type === 'warning').length;
                      const completionCount = groupSignals.filter(s => s.type === 'completion').length;
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
                                <div className="flex items-center gap-1 ml-1">
                                  {confirmCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                      <CheckCircle2 className="h-2.5 w-2.5" />{confirmCount}
                                    </span>
                                  )}
                                  {invalidCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                                      <AlertTriangle className="h-2.5 w-2.5" />{invalidCount}
                                    </span>
                                  )}
                                  {completionCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                                      <Target className="h-2.5 w-2.5" />{completionCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                          {!isCollapsed && groupSignals.map(renderSignalRow)}
                        </Fragment>
                      );
                    })}
                  </>
                )}
              </>
            ) : (
              filtered.map(renderSignalRow)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
