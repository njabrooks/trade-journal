'use client';

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
}

function formatDateShort(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
}

function getDeltaColor(delta: number): string {
  if (delta > 0) return '#10b981'; // emerald-500
  if (delta < 0) return '#ef4444'; // red-500
  return '#94a3b8';               // slate-400
}

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
}: SignalCumulativeScoreChartProps) {
  if (scores.length < 2) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Not enough data yet — conviction trend appears after 2+ days of synthesis.
      </div>
    );
  }

  const gradientId = 'cumulativeGradient';

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={scores} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.5)' }} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <Bar dataKey="delta" barSize={14} radius={[2, 2, 0, 0]}>
          {scores.map((entry, idx) => (
            <Cell key={idx} fill={getDeltaColor(entry.delta)} />
          ))}
        </Bar>
        <Area
          dataKey="cumulativeScore"
          stroke="#6366f1"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          type="monotone"
          activeDot={{ r: 3, fill: '#6366f1' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
