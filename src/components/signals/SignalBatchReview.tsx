'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Check,
  X,
  Target,
  Scale,
  Edit2,
  CheckCheck,
  XOctagon,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Signal } from '@/db/schema';
import { SignalConfigForm, type ExplicitDetails } from './SignalConfigForm';

interface SignalBatchReviewProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle?: string;
  onComplete?: () => void;
}

interface SignalWithModifications extends Signal {
  pendingModifications?: {
    statement?: string;
    notes?: string;
    importance?: 'critical' | 'significant' | 'supporting';
  };
}

export function SignalBatchReview({
  thesisId,
  thesisType,
  thesisTitle,
  onComplete,
}: SignalBatchReviewProps) {
  const [signals, setSignals] = useState<SignalWithModifications[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [configuringSignal, setConfiguringSignal] = useState<Signal | null>(null);

  // Fetch recommended signals
  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/signals/batch-review?thesisId=${thesisId}&thesisType=${thesisType}`
      );
      if (!response.ok) throw new Error('Failed to fetch signals');
      const data = await response.json();
      setSignals(data.signals || []);
    } catch (error) {
      console.error('Error fetching signals:', error);
      toast.error('Failed to load recommended signals');
    } finally {
      setLoading(false);
    }
  }, [thesisId, thesisType]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // Handle single signal accept
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

      // Check if all signals are processed
      if (signals.length === 1) {
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

  // Handle single signal reject
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

      // Check if all signals are processed
      if (signals.length === 1) {
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

  // Handle bulk accept all
  const handleAcceptAll = async () => {
    setProcessingIds(new Set(signals.map((s) => s.id)));
    try {
      const response = await fetch('/api/signals/batch-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept_all',
          thesisId,
          thesisType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept all signals');
      }

      const data = await response.json();
      setSignals([]);
      toast.success(`Accepted ${data.count} signals`);
      onComplete?.();
    } catch (error) {
      console.error('Error accepting all signals:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to accept all signals');
    } finally {
      setProcessingIds(new Set());
    }
  };

  // Handle bulk reject all
  const handleRejectAll = async () => {
    setProcessingIds(new Set(signals.map((s) => s.id)));
    try {
      const response = await fetch('/api/signals/batch-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject_all',
          thesisId,
          thesisType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reject all signals');
      }

      const data = await response.json();
      setSignals([]);
      toast.success(`Rejected ${data.count} signals`);
      onComplete?.();
    } catch (error) {
      console.error('Error rejecting all signals:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reject all signals');
    } finally {
      setProcessingIds(new Set());
    }
  };

  // Update pending modifications for a signal
  const updateModifications = (signalId: string, mods: SignalWithModifications['pendingModifications']) => {
    setSignals((prev) =>
      prev.map((s) =>
        s.id === signalId ? { ...s, pendingModifications: { ...s.pendingModifications, ...mods } } : s
      )
    );
  };

  // Handle accepting signal as explicit with configuration
  const handleAcceptAsExplicit = async (config: ExplicitDetails) => {
    if (!configuringSignal) return;

    const signalId = configuringSignal.id;
    setProcessingIds((prev) => new Set(prev).add(signalId));

    try {
      // Accept the signal with modifications to make it explicit
      const response = await fetch('/api/signals/batch-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          signalId,
          modifications: {
            // Update category to data-driven
            category: 'data_driven',
          },
          // Include data-driven trigger details to be stored
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

      // Check if all signals are processed
      if (signals.length === 1) {
        onComplete?.();
      }
    } catch (error) {
      console.error('Error accepting signal as explicit:', error);
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
  const typeColors: Record<string, string> = {
    confirmation: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-red-100 text-red-700',
  };

  const importanceColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    significant: 'bg-amber-100 text-amber-700 border-amber-200',
    supporting: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  const categoryIcons: Record<string, React.ReactNode> = {
    data_driven: <Target className="w-3 h-3" />,
    judgment: <Scale className="w-3 h-3" />,
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center gap-2 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading recommended signals...</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (signals.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-900">All signals reviewed</p>
        <p className="text-xs text-slate-500 mt-1">
          No pending recommended signals for this thesis.
        </p>
      </div>
    );
  }

  const confirmationCount = signals.filter((s) => s.type === 'confirmation').length;
  const warningCount = signals.filter((s) => s.type === 'warning').length;

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Review Recommended Signals
            </h3>
            {thesisTitle && (
              <p className="text-xs text-slate-500 mt-0.5">{thesisTitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3 h-3" />
              {confirmationCount} confirmation
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="w-3 h-3" />
              {warningCount} warning
            </span>
          </div>
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAcceptAll}
            disabled={processingIds.size > 0}
            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
          >
            <CheckCheck className="w-4 h-4 mr-1" />
            Accept All ({signals.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRejectAll}
            disabled={processingIds.size > 0}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <XOctagon className="w-4 h-4 mr-1" />
            Reject All
          </Button>
        </div>
      </div>

      {/* Signals List */}
      <div className="divide-y divide-slate-100">
        {signals.map((signal) => {
          const isEditing = editingId === signal.id;
          const isProcessing = processingIds.has(signal.id);

          return (
            <div key={signal.id} className={`px-4 py-3 ${isProcessing ? 'opacity-50' : ''}`}>
              {/* Signal Card */}
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Badges - simplified */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {/* Type badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${
                        typeColors[signal.type]
                      }`}
                    >
                      {signal.type === 'confirmation' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {signal.type}
                    </span>

                    {/* Importance badge */}
                    <span
                      className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded border ${
                        importanceColors[signal.pendingModifications?.importance || signal.importance]
                      }`}
                    >
                      {signal.pendingModifications?.importance || signal.importance}
                    </span>

                    {/* Category badge */}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-slate-600 bg-slate-100 rounded">
                      {categoryIcons[signal.category]}
                      {signal.category.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Statement */}
                  {isEditing ? (
                    <textarea
                      value={signal.pendingModifications?.statement ?? signal.statement}
                      onChange={(e) => updateModifications(signal.id, { statement: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                      rows={2}
                      placeholder="Signal statement..."
                    />
                  ) : (
                    <p className="text-sm text-slate-900 font-medium">
                      {signal.pendingModifications?.statement || signal.statement}
                    </p>
                  )}

                  {/* Notes - shown inline (not behind expand) */}
                  {isEditing ? (
                    <div className="mt-2">
                      <textarea
                        value={signal.pendingModifications?.notes ?? signal.notes ?? ''}
                        onChange={(e) => updateModifications(signal.id, { notes: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                        rows={3}
                        placeholder="Notes (optional)..."
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-slate-500">Importance:</span>
                        <select
                          value={signal.pendingModifications?.importance || signal.importance}
                          onChange={(e) =>
                            updateModifications(signal.id, {
                              importance: e.target.value as 'critical' | 'significant' | 'supporting',
                            })
                          }
                          className="text-xs border border-slate-200 rounded px-2 py-1"
                        >
                          <option value="critical">Critical</option>
                          <option value="significant">Significant</option>
                          <option value="supporting">Supporting</option>
                        </select>
                      </div>
                    </div>
                  ) : signal.notes ? (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{signal.notes}</p>
                  ) : null}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          // Clear modifications if canceling
                          setSignals((prev) =>
                            prev.map((s) =>
                              s.id === signal.id ? { ...s, pendingModifications: undefined } : s
                            )
                          );
                        }}
                        disabled={isProcessing}
                        className="text-slate-500"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          handleAccept(signal.id, signal.pendingModifications);
                          setEditingId(null);
                        }}
                        disabled={isProcessing}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            Save & Accept
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(signal.id)}
                        disabled={isProcessing}
                        className="text-slate-500"
                        title="Edit before accepting"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfiguringSignal(signal)}
                        disabled={isProcessing}
                        className="text-blue-600 hover:bg-blue-50"
                        title="Accept as explicit with data trigger"
                      >
                        <Zap className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReject(signal.id)}
                        disabled={isProcessing}
                        className="text-red-600 hover:bg-red-50"
                        title="Reject signal"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleAccept(signal.id)}
                        disabled={isProcessing}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        title="Accept as judgment-based"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Signal Configuration Form */}
      <SignalConfigForm
        signal={configuringSignal ?? undefined}
        isOpen={configuringSignal !== null}
        onClose={() => setConfiguringSignal(null)}
        onSubmit={handleAcceptAsExplicit}
        mode="create"
      />
    </div>
  );
}
