'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SignalTrendIndicatorProps {
  pctToThreshold: number | null;
  signalType: string; // 'confirmation' | 'invalidation' | 'completion'
  assessment?: string | null;
}

const ASSESSMENT_SHORT: Record<string, { label: string; color: string; invalidationColor?: string }> = {
  neutral:       { label: 'Neutral',       color: 'text-muted-foreground' },
  strengthening: { label: 'Strengthening', color: 'text-blue-600 dark:text-blue-400', invalidationColor: 'text-amber-600 dark:text-amber-400' },
  weakening:     { label: 'Weakening',     color: 'text-amber-600 dark:text-amber-400', invalidationColor: 'text-emerald-600 dark:text-emerald-400' },
  confirmed:     { label: 'Confirmed',     color: 'text-emerald-600 dark:text-emerald-400' },
  invalidated:   { label: 'Invalidated',   color: 'text-red-600 dark:text-red-400' },
};

export function SignalTrendIndicator({ pctToThreshold, signalType, assessment }: SignalTrendIndicatorProps) {
  const isInvalidation = signalType === 'invalidation' || signalType === 'warning';

  // Quantitative: show % to threshold
  if (pctToThreshold !== null) {
    const pct = pctToThreshold;

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
      const color = (isInvalidation && info.invalidationColor) ? info.invalidationColor : info.color;
      return (
        <span className={`text-xs font-medium ${color}`}>
          {info.label}
        </span>
      );
    }
  }

  return <span className="text-xs text-muted-foreground">—</span>;
}
