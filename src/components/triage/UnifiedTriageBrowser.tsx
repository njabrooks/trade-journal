'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  UnifiedTriageRecord,
  UnifiedTriageFilterCounts,
  TriageObjectType,
} from '@/types/triage';
import { ExpandedTriageDetail } from './ExpandedTriageDetail';

interface UnifiedTriageBrowserProps {
  records: UnifiedTriageRecord[];
  counts: UnifiedTriageFilterCounts;
  // Entity context - when provided, hides type filters and shows entity-specific view
  thesisId?: string;
  strategyId?: string;
}

type ObjectTypeFilter = 'all' | TriageObjectType;
type SortColumn = 'title' | 'objectType' | 'trigger' | 'severity' | 'status' | 'date';
type SortDirection = 'asc' | 'desc';
type GroupBy = 'none' | 'status';
type BaseFilter = 'needs_action' | 'all';
type TypeFilter = 'all' | 'macro_thesis' | 'asset_thesis' | 'positions_strategies';

// Severities that require action (shown in "Needs Action" view)
// Note: Status is workflow state (inbox/in_progress/done), severity is importance level
const ACTION_SEVERITIES = ['urgent', 'attention'];

// Get detail page URL for a triage record (returns null if no detail page exists)
function getDetailUrl(record: UnifiedTriageRecord): string | null {
  switch (record.objectType) {
    case 'macro_thesis':
      return `/macro-theses/${record.objectId}`;
    case 'asset_thesis':
      return `/asset-theses/${record.objectId}`;
    case 'strategy':
      return `/strategies/${record.objectId}`;
    case 'position':
      // Positions don't have a dedicated page, link to strategy if available
      return record.strategyId ? `/strategies/${record.strategyId}` : null;
    default:
      return null;
  }
}

export function UnifiedTriageBrowser({ records, counts, thesisId, strategyId }: UnifiedTriageBrowserProps) {
  const router = useRouter();
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Determine if we're in an entity-specific context (thesis or strategy detail page)
  const isEntityContext = !!(thesisId || strategyId);

  // Quick filter states (two-tier: base filter + type filter)
  const [baseFilter, setBaseFilter] = useState<BaseFilter>('needs_action');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [objectTypeFilter, setObjectTypeFilter] = useState<ObjectTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [triggerFilter, setTriggerFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Sort states (default to status/severity order)
  const [sortColumn, setSortColumn] = useState<SortColumn>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Group by state
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

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

  // Get unique values for filter dropdowns
  const uniqueStatuses = useMemo(() => {
    return Object.keys(counts.status).sort();
  }, [counts.status]);

  const uniqueTriggers = useMemo(() => {
    return Object.keys(counts.trigger).sort();
  }, [counts.trigger]);

  // Filter and sort records
  const filteredAndSortedRecords = useMemo(() => {
    let result = [...records];

    // Base filter (applied first)
    if (baseFilter === 'needs_action') {
      // Filter by severity (importance level) AND exclude completed items
      result = result.filter((r) =>
        r.status !== 'done' &&
        ACTION_SEVERITIES.includes(r.severity ?? '')
      );
    }
    // 'all' shows everything

    // Type filter (applied on top of base filter)
    if (typeFilter === 'macro_thesis') {
      result = result.filter((r) => r.objectType === 'macro_thesis');
    } else if (typeFilter === 'asset_thesis') {
      result = result.filter((r) => r.objectType === 'asset_thesis');
    } else if (typeFilter === 'positions_strategies') {
      result = result.filter((r) => r.objectType === 'position' || r.objectType === 'strategy');
    }
    // 'all' shows all types

    // Object type filter
    if (objectTypeFilter !== 'all') {
      result = result.filter((r) => r.objectType === objectTypeFilter);
    }

    // Status filter (additional to quick filter)
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Trigger filter
    if (triggerFilter !== 'all') {
      result = result.filter((r) => r.trigger === triggerFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const searchableText = [
          r.title,
          r.trigger,
          r.status,
          r.objectType,
          r.strategyKey,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchableText.includes(query);
      });
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortColumn) {
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'objectType':
          aVal = a.objectType;
          bVal = b.objectType;
          break;
        case 'trigger':
          aVal = a.trigger.toLowerCase();
          bVal = b.trigger.toLowerCase();
          break;
        case 'severity':
          // Severity order (importance): urgent > attention > monitor > info
          aVal = getSeverityOrder(a.severity);
          bVal = getSeverityOrder(b.severity);
          break;
        case 'status':
          // Status order (workflow): inbox > in_progress > done
          aVal = getWorkflowStatusOrder(a.status);
          bVal = getWorkflowStatusOrder(b.status);
          break;
        case 'date':
        default:
          aVal = a.date.getTime();
          bVal = b.date.getTime();
          break;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [records, baseFilter, typeFilter, objectTypeFilter, statusFilter, triggerFilter, searchQuery, sortColumn, sortDirection]);

  // Group records by status
  const groupedRecords = useMemo(() => {
    if (groupBy !== 'status') return null;

    // Define severity groups in order (now using severity field, not status)
    // Status: workflow state (inbox/in_progress/done)
    // Severity: importance level (urgent/attention/monitor/info)
    const severityGroups = [
      { key: 'urgent', label: 'Urgent', severities: ['urgent'] },
      { key: 'attention', label: 'Needs Attention', severities: ['attention'] },
      { key: 'monitor', label: 'Monitor', severities: ['monitor'] },
      { key: 'info', label: 'Info', severities: ['info'] },
      { key: 'done', label: 'Completed', statuses: ['done'] },  // Group by status = done
    ];

    const groups: Array<{ key: string; label: string; records: UnifiedTriageRecord[] }> = [];

    for (const group of severityGroups) {
      // Group by severity (or status for 'done' group)
      const groupRecords = filteredAndSortedRecords.filter((r) => {
        if (group.statuses) {
          return group.statuses.includes(r.status);
        }
        return group.severities?.includes(r.severity ?? '') && r.status !== 'done';
      });

      if (groupRecords.length > 0) {
        groups.push({
          key: group.key,
          label: group.label,
          records: groupRecords,
        });
      }
    }

    // Add any unmatched records to 'other'
    const matchedIds = new Set(groups.flatMap((g) => g.records.map((r) => r.id)));
    const otherRecords = filteredAndSortedRecords.filter((r) => !matchedIds.has(r.id));
    if (otherRecords.length > 0) {
      groups.push({ key: 'other', label: 'Other', records: otherRecords });
    }

    return groups;
  }, [filteredAndSortedRecords, groupBy]);

  // Handle sort
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Sort icon helper
  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  // Render a single record row (extracted for reuse in grouped and flat rendering)
  const renderRecordRow = (record: UnifiedTriageRecord) => {
    const isExpanded = expandedRecord === record.id;
    const detailUrl = getDetailUrl(record);

    return (
      <Fragment key={record.id}>
        {/* Main Row */}
        <tr className="border-b hover:bg-slate-50 transition-colors">
          {/* Title with Direction Icon */}
          <td className="px-4 py-3">
            {detailUrl ? (
              <Link
                href={detailUrl}
                className="text-slate-900 font-medium hover:text-blue-600 transition-colors text-left flex items-center gap-1.5"
              >
                {/* Direction indicator for thesis records */}
                {record.direction && (
                  <DirectionIcon direction={record.direction} />
                )}
                {record.title}
              </Link>
            ) : (
              <button
                onClick={() => setExpandedRecord(isExpanded ? null : record.id)}
                className="text-slate-900 font-medium hover:text-blue-600 transition-colors text-left flex items-center gap-1.5"
              >
                {/* Direction indicator for thesis records */}
                {record.direction && (
                  <DirectionIcon direction={record.direction} />
                )}
                {record.title}
              </button>
            )}
          </td>

          {/* Object Type */}
          <td className="px-4 py-3">
            <Badge className={getObjectTypeBadgeColor(record.objectType)}>
              {formatObjectTypeLabel(record.objectType)}
            </Badge>
          </td>

          {/* Trigger */}
          <td className="px-4 py-3">
            <Badge className={getTriggerBadgeColor(record.trigger)}>
              {formatTriggerLabel(record.trigger)}
            </Badge>
          </td>

          {/* Severity */}
          <td className="px-4 py-3 text-center">
            {record.severity && (
              <Badge className={getSeverityBadgeColor(record.severity)}>
                {formatStatusLabel(record.severity)}
              </Badge>
            )}
          </td>

          {/* Status */}
          <td className="px-4 py-3 text-center">
            <Badge className={getStatusBadgeColor(record.status)}>
              {formatStatusLabel(record.status)}
            </Badge>
          </td>

          {/* Date */}
          <td className="px-4 py-3 text-slate-600">
            {formatDate(record.date)}
          </td>

          {/* Actions */}
          <td className="px-4 py-3 text-right">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpandedRecord(isExpanded ? null : record.id)}
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
            <td colSpan={7} className="px-4 py-4">
              <ExpandedTriageDetail
                record={record}
                onDismiss={() => handleDismiss(record.id, record)}
                onActionComplete={() => handleActionComplete(record.id)}
              />
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  // Handle action completion (TRADE, MONITOR, etc.)
  const handleActionComplete = (recordId: string) => {
    setExpandedRecord(null);
    router.refresh();
  };

  // Handle dismiss action
  const handleDismiss = async (recordId: string, record: UnifiedTriageRecord) => {
    try {
      if (record.thesisTriageRecord) {
        // Thesis triage - set status to 'done' with severity 'info' (dismissed)
        await fetch(`/api/thesis-triage/${recordId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done', severity: 'info' }),
        });
      } else {
        // Position/strategy triage
        await fetch('/api/triage/action/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recordIds: [recordId],
            action: 'DISMISS',
          }),
        });
      }
      setExpandedRecord(null);
      router.refresh();
    } catch (error) {
      console.error('Failed to dismiss triage record:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick Filters and Controls Bar */}
      <div className="flex items-center gap-2">
        {/* Filters and Group By Controls */}
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
        <Button
          variant={groupBy === 'status' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGroupBy(groupBy === 'status' ? 'none' : 'status')}
          className="gap-2"
        >
          <Layers className="h-4 w-4" />
          Group by Severity
        </Button>

        <div className="w-px h-6 bg-slate-200" /> {/* Divider */}

        {/* Base Filter Buttons */}
        <Button
          variant={baseFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBaseFilter('all')}
        >
          All Triage
        </Button>
        <Button
          variant={baseFilter === 'needs_action' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBaseFilter('needs_action')}
        >
          Needs Action
        </Button>

        {/* Type Filter Buttons (only shown on main triage page, not in entity context) */}
        {!isEntityContext && (
          <>
            <div className="w-px h-6 bg-slate-200" /> {/* Divider */}

            <Button
              variant={typeFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTypeFilter('all')}
            >
              All Types
            </Button>
            <Button
              variant={typeFilter === 'macro_thesis' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTypeFilter('macro_thesis')}
            >
              Macro Theses
            </Button>
            <Button
              variant={typeFilter === 'asset_thesis' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTypeFilter('asset_thesis')}
            >
              Asset Theses
            </Button>
            <Button
              variant={typeFilter === 'positions_strategies' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTypeFilter('positions_strategies')}
            >
              Positions & Strategies
            </Button>
          </>
        )}

        <div className="ml-auto text-sm text-slate-600">
          Showing {filteredAndSortedRecords.length} of {records.length} triage items
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
              placeholder="Search by title, trigger, status... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className={`grid gap-4 ${isEntityContext ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
            {/* Object Type - hidden in entity context */}
            {!isEntityContext && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Type
                </label>
                <select
                  value={objectTypeFilter}
                  onChange={(e) => setObjectTypeFilter(e.target.value as ObjectTypeFilter)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="position">Position ({counts.objectType.position})</option>
                  <option value="strategy">Strategy ({counts.objectType.strategy})</option>
                  <option value="asset_thesis">Asset Thesis ({counts.objectType.asset_thesis})</option>
                  <option value="macro_thesis">Macro Thesis ({counts.objectType.macro_thesis})</option>
                </select>
              </div>
            )}

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                {uniqueStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)} ({counts.status[status]})
                  </option>
                ))}
              </select>
            </div>

            {/* Trigger */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Trigger
              </label>
              <select
                value={triggerFilter}
                onChange={(e) => setTriggerFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Triggers</option>
                {uniqueTriggers.map((trigger) => (
                  <option key={trigger} value={trigger}>
                    {formatTriggerLabel(trigger)} ({counts.trigger[trigger]})
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
                setStatusFilter('all');
                setTriggerFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Triage Table */}
      <section className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedRecords.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              No triage items match the selected filters.
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
                    onClick={() => handleSort('objectType')}
                  >
                    <div className="flex items-center gap-2">
                      Type
                      {getSortIcon('objectType')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('trigger')}
                  >
                    <div className="flex items-center gap-2">
                      Trigger
                      {getSortIcon('trigger')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('severity')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Severity
                      {getSortIcon('severity')}
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
                    onClick={() => handleSort('date')}
                  >
                    <div className="flex items-center gap-2">
                      Date
                      {getSortIcon('date')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupBy === 'status' && groupedRecords ? (
                  // Grouped rendering
                  groupedRecords.map((group) => (
                    <Fragment key={group.key}>
                      {/* Group Header */}
                      <tr className={`${getSeverityGroupHeaderColor(group.key)}`}>
                        <td colSpan={7} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">
                              {group.label}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {group.records.length}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                      {/* Group Records */}
                      {group.records.map((record) => renderRecordRow(record))}
                    </Fragment>
                  ))
                ) : (
                  // Flat rendering
                  filteredAndSortedRecords.map((record) => renderRecordRow(record))
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

// Helper components

/**
 * Direction indicator icon for thesis records
 * Shows TrendingUp (green) for bullish, TrendingDown (red) for bearish, Minus (gray) for neutral
 */
function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'bullish') {
    return <TrendingUp className="h-4 w-4 text-emerald-600 flex-shrink-0" />;
  }
  if (direction === 'bearish') {
    return <TrendingDown className="h-4 w-4 text-rose-600 flex-shrink-0" />;
  }
  // Neutral
  return <Minus className="h-4 w-4 text-slate-400 flex-shrink-0" />;
}

// Helper functions

// Severity order for sorting (importance level: urgent > attention > monitor > info)
function getSeverityOrder(severity: string | null | undefined): number {
  const order: Record<string, number> = {
    urgent: 4,
    critical: 4,  // Legacy alias
    attention: 3,
    high: 3,      // Legacy alias
    monitor: 2,
    medium: 2,    // Legacy alias
    info: 1,
    low: 1,       // Legacy alias
  };
  return order[severity ?? ''] ?? 0;
}

// Workflow status order for sorting (workflow state: inbox > in_progress > done)
function getWorkflowStatusOrder(status: string): number {
  const order: Record<string, number> = {
    inbox: 3,
    in_progress: 2,
    done: 1,
    // Legacy values
    pending: 3,
    in_review: 2,
    complete: 1,
    actioned: 1,
    dismissed: 0,
  };
  return order[status] ?? 0;
}

// Severity badge colors (importance level: urgent > attention > monitor > info)
function getSeverityBadgeColor(severity: string): string {
  const colors: Record<string, string> = {
    urgent: 'bg-rose-100 text-rose-700',
    critical: 'bg-rose-100 text-rose-700',  // Legacy alias
    attention: 'bg-amber-100 text-amber-700',
    high: 'bg-amber-100 text-amber-700',  // Legacy alias
    monitor: 'bg-blue-100 text-blue-700',
    medium: 'bg-blue-100 text-blue-700',  // Legacy alias
    info: 'bg-slate-100 text-slate-600',
    low: 'bg-slate-100 text-slate-600',  // Legacy alias
  };
  return colors[severity] ?? 'bg-slate-100 text-slate-600';
}

// Status badge colors (workflow state: inbox > in_progress > done)
function getStatusBadgeColor(status: string): string {
  const colors: Record<string, string> = {
    inbox: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-purple-100 text-purple-700',
    done: 'bg-emerald-100 text-emerald-700',
    // Legacy values (for backwards compatibility)
    pending: 'bg-yellow-100 text-yellow-700',
    in_review: 'bg-purple-100 text-purple-700',
    complete: 'bg-emerald-100 text-emerald-700',
    actioned: 'bg-emerald-100 text-emerald-700',
    dismissed: 'bg-slate-100 text-slate-500',
  };
  return colors[status] ?? 'bg-slate-100 text-slate-700';
}

function getTriggerBadgeColor(trigger: string): string {
  // Use a consistent neutral style for triggers - they describe the action, not severity
  // Using a cyan/teal color to differentiate from status (warm colors) and type (cool colors)
  return 'bg-cyan-50 text-cyan-700 border border-cyan-200';
}

function getObjectTypeBadgeColor(objectType: TriageObjectType): string {
  const colors: Record<TriageObjectType, string> = {
    position: 'bg-blue-100 text-blue-700',
    strategy: 'bg-green-100 text-green-700',
    asset_thesis: 'bg-purple-100 text-purple-700',
    macro_thesis: 'bg-indigo-100 text-indigo-700',
  };
  return colors[objectType];
}

function formatObjectTypeLabel(objectType: TriageObjectType): string {
  const labels: Record<TriageObjectType, string> = {
    position: 'Position',
    strategy: 'Strategy',
    asset_thesis: 'Asset Thesis',
    macro_thesis: 'Macro Thesis',
  };
  return labels[objectType];
}

function formatStatusLabel(status: string): string {
  // Convert snake_case to Title Case
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTriggerLabel(trigger: string): string {
  // All triggers use UPPER_SNAKE_CASE format, display with spaces
  // Just replace underscores with spaces to maintain caps consistency
  return trigger
    .replace(/_/g, ' ');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getSeverityGroupHeaderColor(groupKey: string): string {
  const colors: Record<string, string> = {
    urgent: 'bg-rose-100 text-rose-800 border-b-2 border-rose-200',
    attention: 'bg-amber-100 text-amber-800 border-b-2 border-amber-200',
    monitor: 'bg-blue-100 text-blue-800 border-b-2 border-blue-200',
    info: 'bg-slate-100 text-slate-700 border-b-2 border-slate-200',
    done: 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-200',
    complete: 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-200',  // Legacy alias
    other: 'bg-gray-100 text-gray-700 border-b-2 border-gray-200',
  };
  return colors[groupKey] ?? 'bg-slate-100 text-slate-700';
}
