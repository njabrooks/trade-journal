'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
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
  if (delta > 0) return '#10b981';
  if (delta < 0) return '#ef4444';
  return '#6b7280';
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
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">
        {new Date(d.date).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </p>
      <p className="text-muted-foreground capitalize">
        Assessment: {d.assessment}
      </p>
      <p className="text-muted-foreground">
        Delta: {d.delta > 0 ? '+' : ''}
        {d.delta}
      </p>
      <p className="text-muted-foreground">
        Cumulative: {d.cumulativeScore > 0 ? '+' : ''}
        {d.cumulativeScore}
      </p>
      <p className="text-muted-foreground">
        Observations: {d.observationCount}
      </p>
      {d.evidenceSummary && (
        <p className="mt-1 max-w-[260px] text-muted-foreground whitespace-pre-wrap">
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
        Not enough data yet — conviction trend appears after 2+ days of
        synthesis.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={scores}>
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fontSize: 11 }}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="hsl(var(--muted-foreground))"
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => (
            <span className="text-muted-foreground">{value}</span>
          )}
        />
        <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
        <Bar dataKey="delta" name="Daily delta" barSize={16}>
          {scores.map((entry, idx) => (
            <Cell key={idx} fill={getDeltaColor(entry.delta)} />
          ))}
        </Bar>
        <Line
          dataKey="cumulativeScore"
          name="Cumulative score"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          type="monotone"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
