'use client';

import { useMemo } from 'react';
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';

interface SnapshotPoint {
  date: string;
  observed: number;
  threshold: number;
}

interface SignalSnapshotChartProps {
  snapshots: SnapshotPoint[];
  unit: string;
  signalType: string; // 'confirmation' | 'invalidation' | 'completion'
  height?: number;
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateShort(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

function formatValue(value: number, unit: string): string {
  if (unit === 'USD') {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value.toFixed(2)}`;
  }
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'BTC_RATIO') return value.toPrecision(4);
  if (unit === 'correlation') return value.toFixed(3);
  if (unit === 'status') return value === 0 ? 'Active' : 'Triggered';
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(2);
}

const chartConfig: ChartConfig = {
  observed: {
    label: 'Current',
    color: 'oklch(0.63 0.2 250)',
  },
};

export function SignalSnapshotChart({
  snapshots,
  unit,
  signalType,
  height = 140,
}: SignalSnapshotChartProps) {
  const chartData = useMemo(() => {
    // Reverse so chronological order (API returns desc)
    return [...snapshots].reverse().map(s => ({
      date: s.date,
      observed: s.observed,
      threshold: s.threshold,
    }));
  }, [snapshots]);

  if (chartData.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        {chartData.length === 0 ? 'No snapshot data' : 'Collecting data (need 2+ snapshots)'}
      </div>
    );
  }

  const thresholdValue = chartData[0]?.threshold;
  const isInvalidation = signalType === 'invalidation';
  const lineColor = isInvalidation ? 'oklch(0.65 0.2 25)' : 'oklch(0.63 0.2 250)';
  const fillId = `signalFill-${signalType}`;

  // Fixed Y-axis domain for binary status signals (0 = active, 1 = triggered)
  const isStatus = unit === 'status';
  const yDomain: [number | string, number | string] = isStatus ? [0, 1] : ['auto', 'auto'];

  return (
    <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
      <AreaChart
        data={chartData}
        margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={lineColor} stopOpacity={0.25} />
            <stop offset="95%" stopColor={lineColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tickFormatter={formatDateShort}
          interval="preserveStartEnd"
          tick={{ fontSize: 10 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={48}
          tickFormatter={(v) => formatValue(v, unit)}
          tick={{ fontSize: 10 }}
          domain={yDomain}
        />
        <ChartTooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const obs = payload[0]?.value as number;
            return (
              <div className="border-border/50 bg-background grid min-w-[9rem] gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">{formatDateShort(label)}</div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Value</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {formatValue(obs, unit)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Target</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {formatValue(thresholdValue, unit)}
                  </span>
                </div>
              </div>
            );
          }}
        />
        {/* Threshold reference line */}
        <ReferenceLine
          y={thresholdValue}
          stroke={isInvalidation ? 'oklch(0.7 0.15 25)' : 'oklch(0.6 0.2 145)'}
          strokeDasharray="4 3"
          strokeWidth={1.5}
          label={{
            value: `Target: ${formatValue(thresholdValue, unit)}`,
            position: 'right',
            fill: 'oklch(0.55 0 0)',
            fontSize: 9,
          }}
        />
        <Area
          dataKey="observed"
          type="monotone"
          fill={`url(#${fillId})`}
          stroke={lineColor}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
