'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { Signal } from '@/db/schema';

interface ThesisSignalTriageCardProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  triggeredSignalCount: number;
  totalSignalCount: number;
  triggeredSignalIds: string[];
  currentConviction?: 'high' | 'medium' | 'low';
  onActionComplete?: () => void;
}

// Impact assessment type
type ImpactAssessment = 'strengthens' | 'weakens' | 'no_change';

export function ThesisSignalTriageCard({
  thesisId,
  thesisType,
  thesisTitle,
  triggeredSignalCount,
  totalSignalCount,
  triggeredSignalIds,
  currentConviction,
  onActionComplete,
}: ThesisSignalTriageCardProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<ImpactAssessment | null>(null);
  const [assessmentNotes, setAssessmentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [convictionUpdate, setConvictionUpdate] = useState<'increase' | 'decrease' | 'maintain' | null>(null);

  const isMacro = thesisType === 'macro';
  const thesisUrl = isMacro
    ? `/macro-theses/${thesisId}`
    : `/asset-theses/${thesisId}`;

  // Load all signals for this thesis
  useEffect(() => {
    async function loadSignals() {
      try {
        const response = await fetch(
          `/api/signals/batch-review?thesisId=${thesisId}&thesisType=${thesisType}&includeAll=true`
        );
        if (response.ok) {
          const data = await response.json();
          // API returns recommended only, let's fetch all signals directly
          const allSignalsResponse = await fetch(
            `/api/validation-points/${thesisId}?thesisType=${thesisType}`
          );
          if (allSignalsResponse.ok) {
            const allData = await allSignalsResponse.json();
            setSignals(allData.signals || allData || []);
          } else {
            setSignals(data.signals || []);
          }
        }
      } catch (error) {
        console.error('Error loading signals:', error);
      } finally {
        setLoading(false);
      }
    }

    loadSignals();
  }, [thesisId, thesisType]);

  // Handle assessment submission
  async function handleSubmitAssessment() {
    if (!selectedAssessment) {
      toast.error('Please select an impact assessment');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/signals/assess-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thesisId,
          thesisType,
          assessment: selectedAssessment,
          notes: assessmentNotes,
          convictionUpdate,
          triggeredSignalIds,
        }),
      });

      if (response.ok) {
        toast.success('Assessment recorded');
        onActionComplete?.();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to record assessment');
      }
    } catch (error) {
      console.error('Error submitting assessment:', error);
      toast.error('Failed to submit assessment');
    } finally {
      setSubmitting(false);
    }
  }

  // Get signal status styling
  const getSignalStatusConfig = (status: string, type: string) => {
    const isConfirmation = type === 'confirmation';

    if (status === 'triggered') {
      return {
        icon: isConfirmation
          ? <TrendingUp className="h-4 w-4 text-emerald-600" />
          : <AlertTriangle className="h-4 w-4 text-amber-600" />,
        bgColor: isConfirmation ? 'bg-emerald-500/10' : 'bg-amber-500/10',
        borderColor: isConfirmation ? 'border border-emerald-500/20' : 'border border-amber-500/20',
        badgeColor: isConfirmation ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
        label: 'Triggered',
      };
    }

    return {
      icon: <Shield className="h-4 w-4 text-muted-foreground" />,
      bgColor: 'bg-muted',
      borderColor: 'border',
      badgeColor: 'bg-muted text-muted-foreground',
      label: status === 'monitoring' ? 'Monitoring' : 'Not Triggered',
    };
  };

  // Sort signals: triggered first, then by importance
  const sortedSignals = [...signals].sort((a, b) => {
    // Triggered signals first
    const aTriggered = triggeredSignalIds.includes(a.id);
    const bTriggered = triggeredSignalIds.includes(b.id);
    if (aTriggered && !bTriggered) return -1;
    if (!aTriggered && bTriggered) return 1;

    // Then by importance
    const importanceOrder = { critical: 0, significant: 1, supporting: 2 };
    return (importanceOrder[a.importance as keyof typeof importanceOrder] ?? 2) -
           (importanceOrder[b.importance as keyof typeof importanceOrder] ?? 2);
  });

  // Determine warning vs confirmation triggered
  const triggeredSignals = signals.filter(s => triggeredSignalIds.includes(s.id));
  const warningsTriggered = triggeredSignals.filter(s => s.type === 'invalidation').length;
  const confirmationsTriggered = triggeredSignals.filter(s => s.type === 'confirmation').length;

  return (
    <div className="space-y-4">
      {/* Signal Summary Header */}
      <div className="bg-muted border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Signal Summary</h3>
          </div>
          <Badge
            className={`${
              warningsTriggered > 0
                ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {triggeredSignalCount} of {totalSignalCount} triggered
          </Badge>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span className="text-muted-foreground">
              Confirmations: <span className="font-medium text-foreground">{confirmationsTriggered}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-muted-foreground">
              Warnings: <span className="font-medium text-foreground">{warningsTriggered}</span>
            </span>
          </div>
        </div>

        {/* Current Conviction */}
        {currentConviction && (
          <div className="mt-3 pt-3 border-t border">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Current Conviction</span>
            <Badge
              className={`ml-2 ${
                currentConviction === 'high' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                currentConviction === 'medium' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' :
                'bg-muted text-muted-foreground'
              }`}
            >
              {currentConviction}
            </Badge>
          </div>
        )}
      </div>

      {/* Signals List - Expandable */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-3 flex items-center justify-between bg-muted hover:bg-accent transition-colors"
        >
          <span className="text-sm font-medium text-foreground">
            View All Signals ({signals.length})
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {expanded && (
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-4 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : sortedSignals.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No signals defined for this thesis
              </div>
            ) : (
              sortedSignals.map((signal) => {
                const isTriggered = triggeredSignalIds.includes(signal.id);
                const config = getSignalStatusConfig(signal.status, signal.type);

                return (
                  <div
                    key={signal.id}
                    className={`px-4 py-3 ${config.bgColor} ${isTriggered ? 'border-l-4 ' + config.borderColor : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{config.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isTriggered ? 'text-foreground' : 'text-foreground'}`}>
                          {signal.statement}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge className={config.badgeColor}>{config.label}</Badge>
                          <Badge variant="outline" className="text-xs">
                            {signal.type === 'confirmation' ? 'Confirmation' : 'Warning'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {signal.importance}
                          </Badge>
                        </div>
                        {signal.rationale && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {signal.rationale}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/signals/${signal.id}`}
                        className="text-foreground hover:text-blue-600 transition-colors shrink-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Impact Assessment UI */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-4">
        <h4 className="text-sm font-semibold text-foreground">Impact Assessment</h4>
        <p className="text-xs text-muted-foreground">
          Based on the triggered signals, how does this affect your thesis?
        </p>

        {/* Assessment Buttons */}
        <div className="flex gap-2">
          <Button
            variant={selectedAssessment === 'strengthens' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedAssessment('strengthens')}
            className={`flex-1 gap-1 ${
              selectedAssessment === 'strengthens'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-500/10'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Strengthens
          </Button>
          <Button
            variant={selectedAssessment === 'weakens' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedAssessment('weakens')}
            className={`flex-1 gap-1 ${
              selectedAssessment === 'weakens'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-500/10'
            }`}
          >
            <TrendingDown className="h-4 w-4" />
            Weakens
          </Button>
          <Button
            variant={selectedAssessment === 'no_change' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedAssessment('no_change')}
            className={`flex-1 gap-1 ${
              selectedAssessment === 'no_change'
                ? 'bg-slate-600 hover:bg-slate-700'
                : 'text-foreground border dark:border-border hover:bg-muted'
            }`}
          >
            <Minus className="h-4 w-4" />
            No Change
          </Button>
        </div>

        {/* Conviction Update (optional) */}
        {selectedAssessment && selectedAssessment !== 'no_change' && (
          <div className="pt-3 border-t border-blue-500/20">
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Update Conviction? (optional)
            </label>
            <div className="flex gap-2">
              <Button
                variant={convictionUpdate === 'increase' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConvictionUpdate(convictionUpdate === 'increase' ? null : 'increase')}
                className="flex-1 text-xs"
              >
                Increase
              </Button>
              <Button
                variant={convictionUpdate === 'maintain' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConvictionUpdate(convictionUpdate === 'maintain' ? null : 'maintain')}
                className="flex-1 text-xs"
              >
                Maintain
              </Button>
              <Button
                variant={convictionUpdate === 'decrease' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConvictionUpdate(convictionUpdate === 'decrease' ? null : 'decrease')}
                className="flex-1 text-xs"
              >
                Decrease
              </Button>
            </div>
          </div>
        )}

        {/* Notes */}
        {selectedAssessment && (
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Notes (optional)
            </label>
            <textarea
              value={assessmentNotes}
              onChange={(e) => setAssessmentNotes(e.target.value)}
              placeholder="Add context about this assessment..."
              className="w-full px-3 py-2 text-sm border border-blue-500/20 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
              rows={2}
            />
          </div>
        )}

        {/* Submit */}
        {selectedAssessment && (
          <Button
            onClick={handleSubmitAssessment}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Record Assessment
              </>
            )}
          </Button>
        )}
      </div>

      {/* Link to thesis and strategies */}
      <div className="flex items-center gap-2 pt-2 border-t border">
        <Link href={thesisUrl}>
          <Button variant="outline" size="sm" className="gap-1">
            <ExternalLink className="h-3 w-3" />
            View {isMacro ? 'Thesis' : 'Asset Thesis'}
          </Button>
        </Link>
        {!isMacro && (
          <Link href={`${thesisUrl}#strategies`}>
            <Button variant="outline" size="sm" className="gap-1">
              <ExternalLink className="h-3 w-3" />
              View Linked Strategies
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
