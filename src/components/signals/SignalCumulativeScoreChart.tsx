'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatDateShort } from './signal-constants';

export interface DayScore {
  date: string;
  delta: number;
  cumulativeScore: number;
  assessment: string;
  observationCount: number;
  evidenceSummary: string;
}

interface SignalCumulativeScoreChartProps {
  scores: DayScore[];
  signalType?: string; // 'confirmation' | 'invalidation' | 'completion'
}

/**
 * Delta bar color, signal-type-aware.
 *
 * Confirmation:  +1 = green (good),    -1 = red (bad)
 * Invalidation:  +1 = amber (danger),  -1 = emerald (safe)
 * Completion:    +1 = blue (progress), -1 = slate (regression)
 */
function getDeltaColor(delta: number, signalType: string): string {
  if (delta === 0) return '#94a3b8'; // slate-400

  const isInvalidation = signalType === 'invalidation' || signalType === 'warning';
  const isCompletion = signalType === 'completion';

  if (delta > 0) {
    if (isInvalidation) return '#f59e0b'; // amber-500 — threat growing
    if (isCompletion) return '#3b82f6';   // blue-500
    return '#10b981';                      // emerald-500
  }
  // delta < 0
  if (isInvalidation) return '#10b981';   // emerald-500 — threat receding
  if (isCompletion) return '#94a3b8';     // slate-400
  return '#ef4444';                        // red-500
}

/** Cumulative line color per signal type */
const CUMULATIVE_LINE_COLORS: Record<string, string> = {
  confirmation: '#6366f1', // indigo
  invalidation: '#f59e0b', // amber
  warning:      '#f59e0b',
  completion:   '#3b82f6', // blue
};

const CUMULATIVE_GRADIENT_COLORS: Record<string, string> = {
  confirmation: '#6366f1',
  invalidation: '#f59e0b',
  warning:      '#f59e0b',
  completion:   '#3b82f6',
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DayScore }>;
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md space-y-0.5">
      <p className="font-medium text-foreground">
        {new Date(d.date).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </p>
      <p className="text-muted-foreground capitalize">
        {d.assessment}
        {d.delta > 0 ? ' (+1)' : d.delta < 0 ? ' (−1)' : ' (0)'}
      </p>
      <p className="text-muted-foreground">
        Cumulative: {d.cumulativeScore > 0 ? '+' : ''}
        {d.cumulativeScore}
      </p>
      {d.observationCount > 1 && (
        <p className="text-muted-foreground">{d.observationCount} observations</p>
      )}
      {d.evidenceSummary && (
        <p className="mt-1 max-w-[260px] text-muted-foreground leading-relaxed">
          {d.evidenceSummary}
        </p>
      )}
    </div>
  );
}

export function SignalCumulativeScoreChart({
  scores,
  signalType = 'confirmation',
}: SignalCumulativeScoreChartProps) {
  if (scores.length < 2) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Not enough data yet — conviction trend appears after 2+ days of synthesis.
      </div>
    );
  }

  const gradientId = `cumulativeGradient-${signalType}`;
  const lineColor = CUMULATIVE_LINE_COLORS[signalType] || CUMULATIVE_LINE_COLORS.confirmation;
  const gradientColor = CUMULATIVE_GRADIENT_COLORS[signalType] || CUMULATIVE_GRADIENT_COLORS.confirmation;

  // Symmetric Y-axis: zero-centered, bounded by max |cumulative| or |delta|, min ±1
  const yBound = useMemo(() => {
    const maxAbs = Math.max(
      1,
      ...scores.map(s => Math.abs(s.cumulativeScore)),
      ...scores.map(s => Math.abs(s.delta)),
    );
    return maxAbs;
  }, [scores]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={scores} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={gradientColor} stopOpacity={0.2} />
            <stop offset="95%" stopColor={gradientColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          tickMargin={6}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          tickMargin={4}
          width={56}
          allowDecimals={false}
          domain={[-yBound, yBound]}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
        <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
        <Bar dataKey="delta" barSize={14} radius={[2, 2, 0, 0]}>
          {scores.map((entry, idx) => (
            <Cell key={idx} fill={getDeltaColor(entry.delta, signalType)} />
          ))}
        </Bar>
        <Area
          dataKey="cumulativeScore"
          stroke={lineColor}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          type="monotone"
          activeDot={{ r: 3, fill: lineColor }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
