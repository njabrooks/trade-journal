'use client';

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency, formatDateLabel } from '@/lib/formatters';
import type { ThesisPerformance } from '@/db/queries/thesisPerformance';
import type { Excursion } from '@/lib/derived/retrospectiveExcursion';
import type { RetrospectiveEvent, EventSeverity } from '@/db/queries/retrospectiveView';

/**
 * The annotated excursion curve (docs/v2/07 §4d): cumulative P&L over the hold with
 * the peak (MFE) and trough (MAE) marked, the breakeven line, and the process events
 * (signal flips, advisor recs, re-underwrites, decisions) pinned where they happened.
 */
const AREA_COLOR = 'oklch(0.63 0.2 250)';
const MFE_COLOR = 'oklch(0.6 0.16 150)';
const MAE_COLOR = 'oklch(0.6 0.2 20)';
const SEVERITY_COLOR: Record<EventSeverity, string> = {
  positive: 'oklch(0.6 0.16 150)',
  negative: 'oklch(0.6 0.2 20)',
  warning: 'oklch(0.7 0.17 60)',
  neutral: 'oklch(0.62 0.03 250)',
};

function compactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

const MARKER_KINDS = new Set(['signal_verdict', 'advisor_rec', 'reunderwrite', 'decision']);

export function RetrospectiveExcursionChart({
  combined,
  excursion,
  events,
}: {
  combined: ThesisPerformance['combined'];
  excursion: Excursion;
  events: RetrospectiveEvent[];
}) {
  if (combined.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No P&L series for this thesis — excursion appears once a linked strategy has metrics history.
      </p>
    );
  }

  const data = combined.map((p) => ({ date: p.date, cumulative: p.cumulative }));
  const config: ChartConfig = { cumulative: { label: 'Cumulative P&L', color: AREA_COLOR } };
  const markers = events.filter(
    (e) => MARKER_KINDS.has(e.kind) && e.chartDate != null && e.cumulativeAtDate != null
  );

  return (
    <ChartContainer config={config} className="h-[280px] w-full">
      <AreaChart accessibilityLayer data={data} margin={{ left: 0, right: 12, top: 16, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(v) => formatDateLabel(v)}
          interval="preserveStartEnd"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          width={56}
          tickFormatter={compactCurrency}
        />
        <ChartTooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const v = payload[0]?.value as number;
            return (
              <div className="border-border/50 bg-background grid gap-0.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">{formatDateLabel(label)}</div>
                <div className="font-mono tabular-nums text-foreground">{formatCurrency(v)}</div>
              </div>
            );
          }}
        />
        <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
        <Area
          dataKey="cumulative"
          type="monotone"
          stroke={AREA_COLOR}
          fill={AREA_COLOR}
          fillOpacity={0.15}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
        {markers.map((m, i) => (
          <ReferenceDot
            key={`mk-${i}`}
            x={m.chartDate as string}
            y={m.cumulativeAtDate as number}
            r={3.5}
            fill={SEVERITY_COLOR[m.severity]}
            stroke="var(--background)"
            strokeWidth={1}
          />
        ))}
        {excursion.maeDate && !excursion.neverUnderwater && (
          <ReferenceDot
            x={excursion.maeDate}
            y={excursion.mae}
            r={5}
            fill={MAE_COLOR}
            stroke="var(--background)"
            strokeWidth={1.5}
            label={{ value: 'MAE', position: 'bottom', fontSize: 10, fill: MAE_COLOR }}
          />
        )}
        {excursion.mfeDate && !excursion.neverInProfit && (
          <ReferenceDot
            x={excursion.mfeDate}
            y={excursion.mfe}
            r={5}
            fill={MFE_COLOR}
            stroke="var(--background)"
            strokeWidth={1.5}
            label={{ value: 'MFE', position: 'top', fontSize: 10, fill: MFE_COLOR }}
          />
        )}
      </AreaChart>
    </ChartContainer>
  );
}
