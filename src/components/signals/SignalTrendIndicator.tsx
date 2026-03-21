'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ASSESSMENT_LEVELS } from './signal-constants';
import { SignalSparkline } from './SignalSparkline';

interface SignalTrendIndicatorProps {
  pctToThreshold: number | null;
  signalType: string; // 'confirmation' | 'invalidation' | 'completion'
  assessment?: string | null;
  recentSnapshots?: Array<{ date: string; value: number }>;
  threshold?: number | null;
}

export function SignalTrendIndicator({
  pctToThreshold,
  signalType,
  assessment,
  recentSnapshots,
  threshold,
}: SignalTrendIndicatorProps) {
  const isInvalidation = signalType === 'invalidation' || signalType === 'warning';

  // Quantitative: sparkline + % badge
  if (pctToThreshold !== null) {
    const pct = pctToThreshold;

    let color = 'text-muted-foreground';
    if (pct >= 80) color = isInvalidation ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400';
    else if (pct >= 50) color = isInvalidation ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400';

    return (
      <span className={`inline-flex items-center gap-1.5 ${color}`}>
        {recentSnapshots && recentSnapshots.length >= 2 ? (
          <SignalSparkline
            data={recentSnapshots}
            threshold={threshold ?? undefined}
            signalType={signalType}
            width={48}
            height={20}
          />
        ) : (
          (() => {
            const Icon = pct >= 50 ? TrendingUp : pct <= 20 ? TrendingDown : Minus;
            return <Icon className="h-3 w-3" />;
          })()
        )}
        <span className="text-xs font-mono">{pct.toFixed(0)}%</span>
      </span>
    );
  }

  // Qualitative only: show assessment level
  if (assessment) {
    const level = ASSESSMENT_LEVELS[assessment];
    if (level) {
      return (
        <span className={`text-xs font-medium ${level.textColor}`}>
          {level.label}
        </span>
      );
    }
  }

  return <span className="text-xs text-muted-foreground">—</span>;
}
