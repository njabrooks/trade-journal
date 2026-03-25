'use client';

import { useMemo } from 'react';
import { Area, AreaChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  SIGNAL_TYPE_COLORS,
  formatDateShort,
  formatNumericValue,
  type SignalDirection,
} from './signal-constants';

interface SnapshotPoint {
  date: string;
  observed: number;
  threshold: number;
}

export interface SignalSnapshotChartProps {
  snapshots: SnapshotPoint[];
  unit: string;
  signalType: string; // 'confirmation' | 'invalidation' | 'completion'
  direction?: SignalDirection; // 'up_to_threshold' | 'down_to_threshold'
  height?: number;
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
  direction = 'up_to_threshold',
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

  // Use the most recent threshold (last in chronological order) — handles reconfiguration
  const thresholdValue = chartData[chartData.length - 1]?.threshold;
  const isDownToThreshold = direction === 'down_to_threshold';
  const typeConfig = SIGNAL_TYPE_COLORS[signalType] || SIGNAL_TYPE_COLORS.confirmation;
  const lineColor = typeConfig.lineColor;
  const fillId = `signalFill-${signalType}-${direction}`;

  // Compute Y-axis domain that always includes threshold + padding
  const isStatus = unit === 'status';
  const yDomain: [number | string, number | string] = useMemo(() => {
    if (isStatus) return [0, 1];

    const observedValues = chartData.map(d => d.observed);
    const minObs = Math.min(...observedValues);
    const maxObs = Math.max(...observedValues);
    const allMin = Math.min(minObs, thresholdValue);
    const allMax = Math.max(maxObs, thresholdValue);
    const range = allMax - allMin || 1;
    // Use tight range when data doesn't naturally start near zero
    // (e.g., percentages hovering at 55-72% shouldn't floor to 0)
    const dataFarFromZero = allMin > 0 && allMin > range * 2;
    const floor = dataFarFromZero
      ? allMin - range * 0.15
      : allMin >= 0 ? 0 : allMin - range * 0.1;
    const ceiling = allMax + range * 0.15;
    return [floor, ceiling];
  }, [chartData, thresholdValue, isStatus]);

  // Danger zone shading: the region past the threshold where the signal would fire
  // For invalidation + down_to_threshold: danger is BELOW threshold (value dropping toward trigger)
  // For invalidation + up_to_threshold: danger is ABOVE threshold (value rising toward trigger)
  // For confirmation: same logic but with a softer color
  const isInvalidation = signalType === 'invalidation' || signalType === 'warning';
  const dangerColor = isInvalidation ? 'oklch(0.7 0.15 25)' : 'oklch(0.6 0.15 145)';
  // Danger zone bounds: from threshold to the edge of the chart in the trigger direction
  const dangerY1 = thresholdValue;
  // Use a very large/small number to extend to chart edge — Recharts clips to domain
  const dangerY2 = isDownToThreshold ? -1e15 : 1e15;

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
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={56}
          tickFormatter={(v) => formatNumericValue(v, unit)}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
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
                    {formatNumericValue(obs, unit)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Target</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {formatNumericValue(thresholdValue, unit)}
                  </span>
                </div>
              </div>
            );
          }}
        />
        {/* Danger zone shading — region past threshold */}
        {!isStatus && (
          <ReferenceArea
            y1={dangerY1}
            y2={dangerY2}
            fill={dangerColor}
            fillOpacity={0.06}
          />
        )}
        {/* Threshold reference line */}
        <ReferenceLine
          y={thresholdValue}
          stroke={signalType === 'invalidation' || signalType === 'warning' ? 'oklch(0.7 0.15 25)' : 'oklch(0.6 0.2 145)'}
          strokeDasharray="4 3"
          strokeWidth={1.5}
          label={{
            value: `${isDownToThreshold ? 'Threshold' : 'Target'}: ${formatNumericValue(thresholdValue, unit)}`,
            position: isDownToThreshold ? 'insideBottomRight' : 'insideTopRight',
            fill: 'var(--muted-foreground)',
            fontSize: 9,
            offset: 4,
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
