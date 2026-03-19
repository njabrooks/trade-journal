'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SignalTrendIndicatorProps {
  pctToThreshold: number | null;
  signalType: string; // 'confirmation' | 'invalidation' | 'completion'
  assessment?: string | null;
}

const ASSESSMENT_SHORT: Record<string, { label: string; color: string }> = {
  no_evidence: { label: 'None', color: 'text-muted-foreground' },
  emerging: { label: 'Emerging', color: 'text-yellow-600 dark:text-yellow-400' },
  partial: { label: 'Partial', color: 'text-amber-600 dark:text-amber-400' },
  strong: { label: 'Strong', color: 'text-green-600 dark:text-green-400' },
  confirmed: { label: 'Confirmed', color: 'text-emerald-600 dark:text-emerald-400' },
};

export function SignalTrendIndicator({ pctToThreshold, signalType, assessment }: SignalTrendIndicatorProps) {
  // Quantitative: show % to threshold
  if (pctToThreshold !== null) {
    const pct = pctToThreshold;
    const isInvalidation = signalType === 'invalidation';

    // For warning/invalidation signals, approaching threshold is bad
    let color = 'text-muted-foreground';
    if (pct >= 80) color = isInvalidation ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400';
    else if (pct >= 50) color = isInvalidation ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400';

    const Icon = pct >= 50 ? TrendingUp : pct <= 20 ? TrendingDown : Minus;

    return (
      <span className={`inline-flex items-center gap-1 text-xs font-mono ${color}`}>
        <Icon className="h-3 w-3" />
        {pct.toFixed(0)}%
      </span>
    );
  }

  // Qualitative only: show assessment level
  if (assessment) {
    const info = ASSESSMENT_SHORT[assessment];
    if (info) {
      return (
        <span className={`text-xs font-medium ${info.color}`}>
          {info.label}
        </span>
      );
    }
  }

  return <span className="text-xs text-muted-foreground">—</span>;
}
