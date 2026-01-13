'use client';

import { useState, useMemo, useEffect, useRef, Fragment, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Target,
  Scale,
  Filter,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  Zap,
  History,
  Edit2,
  CheckCheck,
  XOctagon,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Signal } from '@/db/schema';
import { SignalConfigForm, type ExplicitDetails } from './SignalConfigForm';

// Types
type SignalType = 'confirmation' | 'warning';
type SignalCategory = 'judgment' | 'data_driven';
type SignalStatus = 'not_triggered' | 'monitoring' | 'triggered' | 'superseded' | 'recommended';
type TableMode = 'browse' | 'review';

type TypeFilter = 'all' | SignalType;
type CategoryFilter = 'all' | SignalCategory;
type StatusFilter = 'all' | SignalStatus;
type SortColumn = 'statement' | 'type' | 'category' | 'status' | 'importance' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

interface SignalWithModifications extends Signal {
  pendingModifications?: {
    statement?: string;
    rationale?: string;
    importance?: 'critical' | 'significant' | 'supporting';
  };
}

interface UnifiedSignalsTableProps {
  // Data
  signals: Signal[];
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle?: string;

  // Mode
  mode: TableMode;

  // Browse mode callbacks
  onUpdateStatus?: (signalId: string) => void;
  onConvertToDataDriven?: (signal: Signal) => void;

  // Review mode callbacks
  onComplete?: () => void;

  // Loading state for external data fetching
  isLoading?: boolean;
}

export function UnifiedSignalsTable({
  signals: initialSignals,
  thesisId,
  thesisType,
  thesisTitle,
  mode,
  onUpdateStatus,
  onConvertToDataDriven,
  onComplete,
  isLoading = false,
}: UnifiedSignalsTableProps) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // State
  const [signals, setSignals] = useState<SignalWithModifications[]>(initialSignals);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [configuringSignal, setConfiguringSignal] = useState<Signal | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Sort states
  const [sortColumn, setSortColumn] = useState<SortColumn>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Update signals when props change
  useEffect(() => {
    setSignals(initialSignals);
  }, [initialSignals]);

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

  // Filter and sort
  const filteredAndSortedSignals = useMemo(() => {
    let result = [...signals];

    // In review mode, only show recommended signals
    if (mode === 'review') {
      result = result.filter((s) => s.status === 'recommended');
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((s) => s.type === typeFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((s) => s.category === categoryFilter);
    }

    // Status filter (only in browse mode)
    if (mode === 'browse' && statusFilter !== 'all') {
      result = result.filter((s) => s.status === statusFilter);
    }

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((s) => {
        const searchableText = [s.statement, s.rationale]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchableText.includes(query);
      });
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number | Date;
      let bVal: string | number | Date;

      switch (sortColumn) {
        case 'statement':
          aVal = a.statement.toLowerCase();
          bVal = b.statement.toLowerCase();
          break;
        case 'type':
          aVal = a.type;
          bVal = b.type;
          break;
        case 'category':
          aVal = a.category;
          bVal = b.category;
          break;
        case 'status':
          const statusOrder = { recommended: 0, not_triggered: 1, monitoring: 2, triggered: 3, superseded: 4 };
          aVal = statusOrder[a.status as keyof typeof statusOrder] ?? 5;
          bVal = statusOrder[b.status as keyof typeof statusOrder] ?? 5;
          break;
        case 'importance':
          const importanceOrder = { critical: 0, significant: 1, supporting: 2 };
          aVal = importanceOrder[a.importance as keyof typeof importanceOrder] ?? 3;
          bVal = importanceOrder[b.importance as keyof typeof importanceOrder] ?? 3;
          break;
        case 'updatedAt':
          aVal = new Date(a.updatedAt).getTime();
          bVal = new Date(b.updatedAt).getTime();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [signals, mode, typeFilter, categoryFilter, statusFilter, searchQuery, sortColumn, sortDirection]);

  // Handlers
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

  const toggleExpanded = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedIds(next);
  };

  // Review mode actions
  const handleAccept = async (signalId: string, modifications?: SignalWithModifications['pendingModifications']) => {
    setProcessingIds((prev) => new Set(prev).add(signalId));
    try {
      const response = await fetch('/api/signals/batch-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          signalId,
          modifications,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept signal');
      }

      setSignals((prev) => prev.filter((s) => s.id !== signalId));
      toast.success('Signal accepted');

      // Check if all signals processed
      if (signals.filter((s) => s.status === 'recommended').length === 1) {
        onComplete?.();
      }
    } catch (error) {
      console.error('Error accepting signal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to accept signal');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(signalId);
        return next;
      });
    }
  };

  const handleReject = async (signalId: string) => {
    setProcessingIds((prev) => new Set(prev).add(signalId));
    try {
      const response = await fetch('/api/signals/batch-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          signalId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reject signal');
      }

      setSignals((prev) => prev.filter((s) => s.id !== signalId));
      toast.success('Signal rejected');

      // Check if all signals processed
      if (signals.filter((s) => s.status === 'recommended').length === 1) {
        onComplete?.();
      }
    } catch (error) {
      console.error('Error rejecting signal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reject signal');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(signalId);
        return next;
      });
    }
  };

  const handleAcceptAll = async () => {
    const recommendedSignals = signals.filter((s) => s.status === 'recommended');
    for (const signal of recommendedSignals) {
      await handleAccept(signal.id);
    }
  };

  const handleRejectAll = async () => {
    const recommendedSignals = signals.filter((s) => s.status === 'recommended');
    for (const signal of recommendedSignals) {
      await handleReject(signal.id);
    }
  };

  const handleAcceptAsDataDriven = async (config: ExplicitDetails) => {
    if (!configuringSignal) return;
    const signalId = configuringSignal.id;

    setProcessingIds((prev) => new Set(prev).add(signalId));
    try {
      const response = await fetch('/api/signals/batch-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          signalId,
          modifications: {
            category: 'data_driven',
          },
          explicitDetails: config,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept signal');
      }

      setSignals((prev) => prev.filter((s) => s.id !== signalId));
      toast.success('Signal accepted and configured as data-driven trigger');
      setConfiguringSignal(null);

      if (signals.filter((s) => s.status === 'recommended').length === 1) {
        onComplete?.();
      }
    } catch (error) {
      console.error('Error accepting signal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to accept signal');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(signalId);
        return next;
      });
    }
  };

  // Style helpers
  const typeIcon = (type: string) => {
    return type === 'confirmation' ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
    ) : (
      <AlertTriangle className="w-4 h-4 text-amber-600" />
    );
  };

  const categoryIcon = (category: string) => {
    return category === 'data_driven' ? (
      <Target className="w-3 h-3" />
    ) : (
      <Scale className="w-3 h-3" />
    );
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'triggered':
        return 'bg-red-100 text-red-700';
      case 'monitoring':
        return 'bg-blue-100 text-blue-700';
      case 'not_triggered':
        return 'bg-slate-100 text-slate-700';
      case 'superseded':
        return 'bg-slate-100 text-slate-500';
      case 'recommended':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const importanceBadgeColor = (importance: string) => {
    switch (importance) {
      case 'critical':
        return 'bg-red-100 text-red-700';
      case 'significant':
        return 'bg-amber-100 text-amber-700';
      case 'supporting':
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  // Counts for filter badges
  const confirmationCount = signals.filter((s) => s.type === 'confirmation').length;
  const warningCount = signals.filter((s) => s.type === 'warning').length;
  const judgmentCount = signals.filter((s) => s.category === 'judgment').length;
  const dataDrivenCount = signals.filter((s) => s.category === 'data_driven').length;

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center gap-2 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading signals...</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (signals.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <p className="text-sm text-slate-500">
          {mode === 'review' ? 'No recommended signals to review.' : 'No signals defined yet.'}
        </p>
        {mode === 'browse' && (
          <p className="text-xs text-slate-400 mt-1">
            Use <code className="px-1 bg-slate-100 rounded">/synthesize-thesis</code> to create signals.
          </p>
        )}
      </div>
    );
  }

  const recommendedCount = signals.filter((s) => s.status === 'recommended').length;

  return (
    <div className="space-y-4">
      {/* Header with bulk actions (review mode) */}
      {mode === 'review' && recommendedCount > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            {recommendedCount} signal{recommendedCount !== 1 ? 's' : ''} to review
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAcceptAll}
              disabled={processingIds.size > 0}
              className="gap-1 text-emerald-600 hover:bg-emerald-50"
            >
              <CheckCheck className="w-4 h-4" />
              Accept All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRejectAll}
              disabled={processingIds.size > 0}
              className="gap-1 text-red-600 hover:bg-red-50"
            >
              <XOctagon className="w-4 h-4" />
              Reject All
            </Button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {showFilters && <span className="text-xs text-slate-500">(ESC)</span>}
        </Button>
        <div className="text-sm text-slate-600">
          Showing {filteredAndSortedSignals.length} of {mode === 'review' ? recommendedCount : signals.length} signals
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
              placeholder="Search signals... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="confirmation">Confirmation ({confirmationCount})</option>
                <option value="warning">Warning ({warningCount})</option>
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                <option value="judgment">Judgment ({judgmentCount})</option>
                <option value="data_driven">Data-Driven ({dataDrivenCount})</option>
              </select>
            </div>

            {/* Status (browse mode only) */}
            {mode === 'browse' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="not_triggered">Not Triggered</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="triggered">Triggered</option>
                  <option value="superseded">Superseded</option>
                  <option value="recommended">Recommended</option>
                </select>
              </div>
            )}
          </div>

          {/* Clear Filters */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('all');
                setCategoryFilter('all');
                setStatusFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Signals Table */}
      <section className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedSignals.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              No signals match the selected filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-3 w-8"></th>
                  <th className="px-2 py-3 w-8"></th>
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('statement')}
                  >
                    <div className="flex items-center gap-2">
                      Statement
                      {getSortIcon('statement')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('category')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Category
                      {getSortIcon('category')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('importance')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Importance
                      {getSortIcon('importance')}
                    </div>
                  </th>
                  {mode === 'browse' && (
                    <th
                      className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center justify-center gap-2">
                        Status
                        {getSortIcon('status')}
                      </div>
                    </th>
                  )}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedSignals.map((signal) => {
                  const isExpanded = expandedIds.has(signal.id);
                  const isProcessing = processingIds.has(signal.id);
                  const isEditing = editingId === signal.id;

                  const explicitDetails = signal.explicitDetails as {
                    metric?: string;
                    threshold?: string | number;
                    dataSources?: string[];
                    monitoringFrequency?: string;
                  } | null;

                  const judgmentDetails = signal.judgmentDetails as {
                    observableProxies?: string[];
                    judgmentCriteria?: string;
                    reviewFrequency?: string;
                  } | null;

                  return (
                    <Fragment key={signal.id}>
                      {/* Main Row */}
                      <tr
                        className={`border-b hover:bg-slate-50 transition-colors ${
                          isProcessing ? 'opacity-50' : ''
                        }`}
                      >
                        {/* Expand Toggle */}
                        <td className="px-2 py-3">
                          <button
                            onClick={() => toggleExpanded(signal.id)}
                            className="p-1 hover:bg-slate-100 rounded"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        </td>

                        {/* Type Icon */}
                        <td className="px-2 py-3">{typeIcon(signal.type)}</td>

                        {/* Statement */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {mode === 'browse' ? (
                              <Link
                                href={`/${thesisType === 'macro' ? 'macro-theses' : 'asset-theses'}/${thesisId}/signals/${signal.id}`}
                                className="text-slate-900 font-medium hover:text-blue-600 hover:underline transition-colors block line-clamp-2"
                              >
                                {signal.statement}
                              </Link>
                            ) : (
                              <span className="text-slate-900 font-medium line-clamp-2">
                                {signal.statement}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant="outline"
                            className="gap-1 text-xs font-normal bg-slate-50"
                          >
                            {categoryIcon(signal.category)}
                            {signal.category === 'data_driven' ? 'Data-Driven' : 'Judgment'}
                          </Badge>
                        </td>

                        {/* Importance */}
                        <td className="px-4 py-3 text-center">
                          <Badge className={`text-xs font-normal ${importanceBadgeColor(signal.importance)}`}>
                            {signal.importance}
                          </Badge>
                        </td>

                        {/* Status (browse mode) */}
                        {mode === 'browse' && (
                          <td className="px-4 py-3 text-center">
                            <Badge className={`text-xs font-normal ${statusBadgeColor(signal.status)}`}>
                              {signal.status.replace('_', ' ')}
                            </Badge>
                          </td>
                        )}

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {mode === 'browse' ? (
                              <>
                                {onUpdateStatus && signal.status !== 'superseded' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onUpdateStatus(signal.id)}
                                    className="h-8 px-2 text-xs"
                                  >
                                    Update
                                  </Button>
                                )}
                                {onConvertToDataDriven && signal.category === 'judgment' && signal.status !== 'superseded' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onConvertToDataDriven(signal)}
                                    className="h-8 px-2 text-xs text-amber-600 hover:bg-amber-50"
                                  >
                                    <Zap className="w-3 h-3 mr-1" />
                                    Data-Driven
                                  </Button>
                                )}
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAccept(signal.id)}
                                  disabled={isProcessing}
                                  className="h-8 px-2 text-xs text-emerald-600 hover:bg-emerald-50"
                                >
                                  {isProcessing ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Check className="w-3 h-3" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleReject(signal.id)}
                                  disabled={isProcessing}
                                  className="h-8 px-2 text-xs text-red-600 hover:bg-red-50"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setConfiguringSignal(signal)}
                                  disabled={isProcessing}
                                  className="h-8 px-2 text-xs text-amber-600 hover:bg-amber-50"
                                  title="Accept and configure as data-driven"
                                >
                                  <Zap className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50">
                          <td colSpan={mode === 'browse' ? 7 : 6} className="px-4 py-4">
                            <div className="ml-8 space-y-3">
                              {/* Rationale */}
                              {signal.rationale && (
                                <div>
                                  <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                                    Rationale
                                  </h5>
                                  <p className="text-sm text-slate-700">{signal.rationale}</p>
                                </div>
                              )}

                              {/* Data-Driven Details */}
                              {signal.category === 'data_driven' && explicitDetails && (
                                <div className="bg-white rounded-md p-3 border border-slate-200">
                                  <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                                    Trigger Criteria
                                  </h5>
                                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    {explicitDetails.metric && (
                                      <>
                                        <dt className="text-slate-500">Metric:</dt>
                                        <dd className="text-slate-900">{explicitDetails.metric}</dd>
                                      </>
                                    )}
                                    {explicitDetails.threshold && (
                                      <>
                                        <dt className="text-slate-500">Threshold:</dt>
                                        <dd className="text-slate-900 font-mono">{explicitDetails.threshold}</dd>
                                      </>
                                    )}
                                    {explicitDetails.dataSources && explicitDetails.dataSources.length > 0 && (
                                      <>
                                        <dt className="text-slate-500">Sources:</dt>
                                        <dd className="text-slate-900">{explicitDetails.dataSources.join(', ')}</dd>
                                      </>
                                    )}
                                    {explicitDetails.monitoringFrequency && (
                                      <>
                                        <dt className="text-slate-500">Frequency:</dt>
                                        <dd className="text-slate-900">{explicitDetails.monitoringFrequency}</dd>
                                      </>
                                    )}
                                  </dl>
                                </div>
                              )}

                              {/* Judgment Details */}
                              {signal.category === 'judgment' && judgmentDetails && (
                                <div className="bg-white rounded-md p-3 border border-slate-200">
                                  <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                                    Assessment Criteria
                                  </h5>
                                  {judgmentDetails.observableProxies && judgmentDetails.observableProxies.length > 0 && (
                                    <div className="mb-2">
                                      <span className="text-xs text-slate-500">Observable Proxies:</span>
                                      <ul className="mt-1 text-sm text-slate-700 list-disc list-inside">
                                        {judgmentDetails.observableProxies.map((proxy, idx) => (
                                          <li key={idx}>{proxy}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {judgmentDetails.judgmentCriteria && (
                                    <div className="mb-2">
                                      <span className="text-xs text-slate-500">Judgment Criteria:</span>
                                      <p className="mt-1 text-sm text-slate-700">{judgmentDetails.judgmentCriteria}</p>
                                    </div>
                                  )}
                                  {judgmentDetails.reviewFrequency && (
                                    <div>
                                      <span className="text-xs text-slate-500">Review Frequency:</span>
                                      <span className="ml-2 text-sm text-slate-700">{judgmentDetails.reviewFrequency}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Browse mode actions */}
                              {mode === 'browse' && (
                                <div className="flex items-center gap-2 pt-2">
                                  {onUpdateStatus && signal.status !== 'superseded' && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => onUpdateStatus(signal.id)}
                                      className="gap-1"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      Update Status
                                    </Button>
                                  )}
                                  {onConvertToDataDriven && signal.category === 'judgment' && signal.status !== 'superseded' && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => onConvertToDataDriven(signal)}
                                      className="gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
                                    >
                                      <Zap className="w-3 h-3" />
                                      Make Data-Driven
                                    </Button>
                                  )}
                                  <Link
                                    href={`/${thesisType === 'macro' ? 'macro-theses' : 'asset-theses'}/${thesisId}/signals/${signal.id}`}
                                  >
                                    <Button variant="outline" size="sm" className="gap-1">
                                      <History className="w-3 h-3" />
                                      View History
                                    </Button>
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
          )}
        </div>
      </section>

      {/* Signal Config Form Dialog (review mode) */}
      {configuringSignal && (
        <SignalConfigForm
          signal={configuringSignal}
          isOpen={!!configuringSignal}
          onClose={() => setConfiguringSignal(null)}
          onSubmit={handleAcceptAsDataDriven}
          mode="upgrade"
        />
      )}
    </div>
  );
}
