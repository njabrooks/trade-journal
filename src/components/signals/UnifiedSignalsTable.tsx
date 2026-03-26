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
  Filter,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  X,
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
import { SignalProgressCard } from './SignalProgressCard';

// Types
type SignalType = 'confirmation' | 'invalidation' | 'completion';
type SignalCategory = 'judgment' | 'data_driven';
type SignalStatus = 'draft' | 'active' | 'complete' | 'rejected';
type TableMode = 'browse' | 'review';

type TypeFilter = 'all' | SignalType;
type StatusFilter = 'all' | 'pending' | SignalStatus;
type SortColumn = 'statement' | 'type' | 'status' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

interface SignalWithModifications extends Signal {
  pendingModifications?: {
    statement?: string;
    notes?: string;
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

  // Review mode callbacks
  onComplete?: () => void;

  // Loading state for external data fetching
  isLoading?: boolean;

  // Optional header action element (e.g., AssessEvidenceButton)
  headerAction?: React.ReactNode;
}

export function UnifiedSignalsTable({
  signals: initialSignals,
  thesisId,
  thesisType,
  thesisTitle,
  mode,
  onUpdateStatus,
  onComplete,
  isLoading = false,
  headerAction,
}: UnifiedSignalsTableProps) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // State
  const [signals, setSignals] = useState<SignalWithModifications[]>(initialSignals);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ statement: string; notes: string }>({ statement: '', notes: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  // Default to 'pending' (draft + active) to hide rejected/complete by default
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
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

    // In review mode, only show draft signals (awaiting review)
    if (mode === 'review') {
      result = result.filter((s) => s.status === 'draft');
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((s) => s.type === typeFilter);
    }

    // Status filter (only in browse mode)
    if (mode === 'browse') {
      if (statusFilter === 'pending') {
        // Show draft + active (hide complete + rejected)
        result = result.filter((s) => s.status === 'draft' || s.status === 'active');
      } else if (statusFilter !== 'all') {
        result = result.filter((s) => s.status === statusFilter);
      }
    }

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((s) => {
        const searchableText = [s.statement, s.notes]
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
          const typeOrder = { confirmation: 0, invalidation: 1, completion: 2 };
          aVal = typeOrder[a.type as keyof typeof typeOrder] ?? 3;
          bVal = typeOrder[b.type as keyof typeof typeOrder] ?? 3;
          break;
        case 'status':
          const statusOrder = { draft: 0, active: 1, complete: 2, rejected: 3 };
          aVal = statusOrder[a.status as keyof typeof statusOrder] ?? 4;
          bVal = statusOrder[b.status as keyof typeof statusOrder] ?? 4;
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
  }, [signals, mode, typeFilter, statusFilter, searchQuery, sortColumn, sortDirection]);

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

  // Inline edit handlers
  const startEditing = (signal: Signal) => {
    setEditingId(signal.id);
    setEditValues({
      statement: signal.statement,
      notes: signal.notes || '',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({ statement: '', notes: '' });
  };

  const saveEdit = async (signalId: string) => {
    const signal = signals.find((s) => s.id === signalId);
    if (!signal) return;

    // Check if anything changed
    const statementChanged = editValues.statement !== signal.statement;
    const notesChanged = editValues.notes !== (signal.notes || '');
    if (!statementChanged && !notesChanged) {
      cancelEditing();
      return;
    }

    setSavingEdit(true);
    try {
      const response = await fetch('/api/validation-points', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: signalId,
          ...(statementChanged && { statement: editValues.statement }),
          ...(notesChanged && { notes: editValues.notes }),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update signal');
      }

      const { signal: updatedSignal } = await response.json();

      // Update local state
      setSignals((prev) =>
        prev.map((s) => (s.id === signalId ? { ...s, ...updatedSignal } : s))
      );

      toast.success('Signal updated');
      cancelEditing();
    } catch (error) {
      console.error('Error updating signal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update signal');
    } finally {
      setSavingEdit(false);
    }
  };

  // Accept/Reject actions (used in both browse and review modes)
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

      if (mode === 'browse') {
        // In browse mode, update the signal's status to 'active' so it remains visible
        setSignals((prev) =>
          prev.map((s) => (s.id === signalId ? { ...s, status: 'active' as const } : s))
        );
        toast.success('Signal accepted and activated');
      } else {
        // In review mode, remove from list (processing queue behavior)
        setSignals((prev) => prev.filter((s) => s.id !== signalId));
        toast.success('Signal accepted');

        // Check if all signals processed
        if (signals.filter((s) => s.status === 'draft').length === 1) {
          onComplete?.();
        }
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

      if (mode === 'browse') {
        // In browse mode, update the signal's status to 'rejected' so it remains visible
        // (unless filtered out by current status filter)
        setSignals((prev) =>
          prev.map((s) => (s.id === signalId ? { ...s, status: 'rejected' as const } : s))
        );
        toast.success('Signal rejected');
      } else {
        // In review mode, remove from list (processing queue behavior)
        setSignals((prev) => prev.filter((s) => s.id !== signalId));
        toast.success('Signal rejected');

        // Check if all signals processed
        if (signals.filter((s) => s.status === 'draft').length === 1) {
          onComplete?.();
        }
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
    const draftSignals = signals.filter((s) => s.status === 'draft');
    for (const signal of draftSignals) {
      await handleAccept(signal.id);
    }
  };

  const handleRejectAll = async () => {
    const draftSignals = signals.filter((s) => s.status === 'draft');
    for (const signal of draftSignals) {
      await handleReject(signal.id);
    }
  };

  // Style helpers
  const typeIcon = (type: string) => {
    switch (type) {
      case 'confirmation':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'completion':
        return <Target className="w-4 h-4 text-blue-600" />;
      default: // invalidation
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'confirmation': return 'Confirmation';
      case 'invalidation': return 'Invalidation';
      case 'completion': return 'Completion';
      default: return type;
    }
  };

  const typeBadgeColor = (type: string) => {
    switch (type) {
      case 'confirmation': return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'invalidation': return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
      case 'completion': return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-muted text-muted-foreground';
      case 'active': return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'complete': return 'bg-muted text-muted-foreground';
      case 'rejected': return 'bg-destructive/15 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Counts for filter badges
  const confirmationCount = signals.filter((s) => s.type === 'confirmation').length;
  const invalidationCount = signals.filter((s) => s.type === 'invalidation').length;
  const completionCount = signals.filter((s) => s.type === 'completion').length;

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border border p-8">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading signals...</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (signals.length === 0) {
    return (
      <div className="bg-card rounded-lg border border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {mode === 'review' ? 'No recommended signals to review.' : 'No signals defined yet.'}
        </p>
        {mode === 'browse' && (
          <p className="text-xs text-muted-foreground mt-1">
            Use <code className="px-1 bg-slate-100 rounded">/build-core-argument</code> to create signals.
          </p>
        )}
      </div>
    );
  }

  const draftCount = signals.filter((s) => s.status === 'draft').length;

  return (
    <div className="space-y-4">
      {/* Header with bulk actions (review mode) */}
      {mode === 'review' && draftCount > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {draftCount} signal{draftCount !== 1 ? 's' : ''} to review
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

      {/* Filter Bar with Quick Filters */}
      <div className="flex items-center gap-2">
        {/* Advanced Filters Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {showFilters && <span className="text-xs text-muted-foreground">(ESC)</span>}
        </Button>

        {mode === 'browse' && (
          <>
            <div className="w-px h-6 bg-slate-200" /> {/* Divider */}

            {/* Status Quick Filter Buttons */}
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('all')}
            >
              All
            </Button>
            <Button
              variant={statusFilter === 'pending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('pending')}
            >
              Open Signals
            </Button>
          </>
        )}

        {/* Count Display */}
        <div className="text-sm text-muted-foreground">
          Showing {filteredAndSortedSignals.length} of {mode === 'review' ? draftCount : signals.length} signals
        </div>

        {/* Header Action (e.g., AssessEvidenceButton) - pushed to right */}
        {headerAction && (
          <div className="ml-auto">
            {headerAction}
          </div>
        )}
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
              placeholder="Search signals... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="confirmation">Confirmation ({confirmationCount})</option>
                <option value="invalidation">Invalidation ({invalidationCount})</option>
                <option value="completion">Completion ({completionCount})</option>
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
                setTypeFilter('all');
                setStatusFilter('pending');
              }}
            >
              Reset Filters
            </Button>
          </div>
        </div>
      )}

      {/* Signals Table */}
      <section className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedSignals.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No signals match the selected filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-3 w-8"></th>
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('type')}
                  >
                    <div className="flex items-center gap-2">
                      Type
                      {getSortIcon('type')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('statement')}
                  >
                    <div className="flex items-center gap-2">
                      Statement
                      {getSortIcon('statement')}
                    </div>
                  </th>
                  {mode === 'browse' && (
                    <th
                      className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
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

                  return (
                    <Fragment key={signal.id}>
                      {/* Main Row */}
                      <tr
                        className={`border-b hover:bg-muted transition-colors ${
                          isProcessing ? 'opacity-50' : ''
                        }`}
                      >
                        {/* Expand Toggle */}
                        <td className="px-2 py-3">
                          <button
                            onClick={() => toggleExpanded(signal.id)}
                            className="p-1 hover:bg-accent rounded"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        </td>

                        {/* Type Badge */}
                        <td className="px-4 py-3">
                          <Badge className={`gap-1 text-xs font-normal ${typeBadgeColor(signal.type)}`}>
                            {typeIcon(signal.type)}
                            {typeLabel(signal.type)}
                          </Badge>
                        </td>

                        {/* Statement */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {mode === 'browse' ? (
                              <Link
                                href={`/signals/${signal.id}`}
                                className="text-foreground font-medium hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors block line-clamp-2"
                              >
                                {signal.statement}
                              </Link>
                            ) : (
                              <span className="text-foreground font-medium line-clamp-2">
                                {signal.statement}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status (browse mode) */}
                        {mode === 'browse' && (
                          <td className="px-4 py-3 text-center">
                            <Badge className={`text-xs font-normal ${statusBadgeColor(signal.status)}`}>
                              {signal.status.replace('_', ' ')}
                            </Badge>
                          </td>
                        )}

                        {/* Actions - unified: recommended signals get Accept/Reject, others get Update/Configure */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {signal.status === 'draft' ? (
                              // Recommended signals: Accept/Reject/Configure actions (same in both modes)
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAccept(signal.id)}
                                  disabled={isProcessing}
                                  className="h-8 px-2 text-xs text-emerald-600 hover:bg-emerald-50"
                                  title="Accept signal"
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
                                  title="Reject signal"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </>
                            ) : (
                              // Accepted signals: Update status action
                              <>
                                {onUpdateStatus && signal.status !== 'rejected' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onUpdateStatus(signal.id)}
                                    className="h-8 px-2 text-xs"
                                  >
                                    Update
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Row */}
                      {isExpanded && (
                        <tr className="bg-muted">
                          <td colSpan={mode === 'browse' ? 5 : 4} className="px-4 py-4">
                            <div className="ml-8 space-y-3">
                              {isEditing ? (
                                // Edit Form
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                      Statement
                                    </label>
                                    <textarea
                                      value={editValues.statement}
                                      onChange={(e) => setEditValues((prev) => ({ ...prev, statement: e.target.value }))}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      rows={2}
                                      placeholder="Signal statement..."
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                      Notes
                                    </label>
                                    <textarea
                                      value={editValues.notes}
                                      onChange={(e) => setEditValues((prev) => ({ ...prev, notes: e.target.value }))}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      rows={4}
                                      placeholder="Additional notes, context, or response guidance..."
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => saveEdit(signal.id)}
                                      disabled={savingEdit || !editValues.statement.trim()}
                                      className="gap-1"
                                    >
                                      {savingEdit ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Check className="w-3 h-3" />
                                      )}
                                      Save
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={cancelEditing}
                                      disabled={savingEdit}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                // View Mode
                                <>
                                  {/* Notes (simplified - replaces rationale, judgmentDetails, responseProtocol) */}
                                  {signal.notes && (
                                    <div>
                                      <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                        Notes
                                      </h5>
                                      <p className="text-sm text-foreground whitespace-pre-wrap">{signal.notes}</p>
                                    </div>
                                  )}

                                  {/* Signal Progress Tracking */}
                                  {signal.status === 'active' && signal.explicitDetails && (
                                    <div>
                                      <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                        Tracking
                                      </h5>
                                      <SignalProgressCard signal={signal} />
                                    </div>
                                  )}

                                  {/* Data-Driven Trigger Criteria (for configured data-driven signals) */}
                                  {signal.category === 'data_driven' && explicitDetails && (
                                    <div className="bg-card rounded-md p-3 border border">
                                      <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                                        Trigger Criteria
                                      </h5>
                                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        {explicitDetails.metric && (
                                          <>
                                            <dt className="text-muted-foreground">Metric:</dt>
                                            <dd className="text-foreground">{explicitDetails.metric}</dd>
                                          </>
                                        )}
                                        {explicitDetails.threshold && (
                                          <>
                                            <dt className="text-muted-foreground">Threshold:</dt>
                                            <dd className="text-foreground font-mono">{explicitDetails.threshold}</dd>
                                          </>
                                        )}
                                        {explicitDetails.dataSources && explicitDetails.dataSources.length > 0 && (
                                          <>
                                            <dt className="text-muted-foreground">Sources:</dt>
                                            <dd className="text-foreground">{explicitDetails.dataSources.join(', ')}</dd>
                                          </>
                                        )}
                                        {explicitDetails.monitoringFrequency && (
                                          <>
                                            <dt className="text-muted-foreground">Frequency:</dt>
                                            <dd className="text-foreground">{explicitDetails.monitoringFrequency}</dd>
                                          </>
                                        )}
                                      </dl>
                                    </div>
                                  )}

                                  {/* Expanded row actions - unified based on signal status */}
                                  <div className="flex items-center gap-2 pt-2">
                                    {signal.status === 'draft' ? (
                                      // Recommended: Edit/Accept/Reject/Configure
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => startEditing(signal)}
                                          disabled={isProcessing}
                                          className="gap-1"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                          Edit
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleAccept(signal.id)}
                                          disabled={isProcessing}
                                          className="gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                        >
                                          <Check className="w-3 h-3" />
                                          Accept
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleReject(signal.id)}
                                          disabled={isProcessing}
                                          className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                                        >
                                          <X className="w-3 h-3" />
                                          Reject
                                        </Button>
                                      </>
                                    ) : (
                                      // Accepted signals: Update/History (no edit - locked after acceptance)
                                      <>
                                        {onUpdateStatus && signal.status !== 'rejected' && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onUpdateStatus(signal.id)}
                                            className="gap-1"
                                          >
                                            Update Status
                                          </Button>
                                        )}
                                        <Link
                                          href={`/signals/${signal.id}`}
                                        >
                                          <Button variant="outline" size="sm" className="gap-1">
                                            <History className="w-3 h-3" />
                                            View History
                                          </Button>
                                        </Link>
                                      </>
                                    )}
                                  </div>
                                </>
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
