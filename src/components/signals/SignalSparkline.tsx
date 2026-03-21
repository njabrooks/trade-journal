'use client';

import { Area, AreaChart, ReferenceLine } from 'recharts';
import { SIGNAL_TYPE_COLORS } from './signal-constants';

interface SignalSparklineProps {
  data: Array<{ date: string; value: number }>;
  threshold?: number;
  signalType: string;
  width?: number;
  height?: number;
}

export function SignalSparkline({
  data,
  threshold,
  signalType,
  width = 48,
  height = 20,
}: SignalSparklineProps) {
  if (data.length < 2) return null;

  const typeConfig = SIGNAL_TYPE_COLORS[signalType] || SIGNAL_TYPE_COLORS.confirmation;
  const color = typeConfig.lineColor;
  const fillId = `sparkFill-${signalType}`;

  // Compute domain including threshold if present
  const values = data.map(d => d.value);
  const min = Math.min(...values, ...(threshold != null ? [threshold] : []));
  const max = Math.max(...values, ...(threshold != null ? [threshold] : []));
  const range = max - min || 1;
  const floor = min >= 0 ? 0 : min - range * 0.1;
  const ceiling = max + range * 0.1;

  return (
    <AreaChart
      data={data}
      width={width}
      height={height}
      margin={{ top: 2, right: 1, bottom: 2, left: 1 }}
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={0.3} />
          <stop offset="95%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {threshold != null && (
        <ReferenceLine
          y={threshold}
          stroke="var(--muted-foreground)"
          strokeDasharray="2 2"
          strokeWidth={0.5}
        />
      )}
      <Area
        dataKey="value"
        type="monotone"
        stroke={color}
        strokeWidth={1.5}
        fill={`url(#${fillId})`}
        dot={false}
        isAnimationActive={false}
      />
    </AreaChart>
  );
}
