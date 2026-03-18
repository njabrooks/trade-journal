'use client';

import { useMemo } from 'react';

interface AssessmentPoint {
  date: string;
  assessment: string;
  summary: string | null;
}

interface AssessmentTimelineProps {
  assessments: AssessmentPoint[];
}

const ASSESSMENT_LEVELS: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  rank: number;
}> = {
  no_evidence: {
    label: 'None',
    color: 'bg-zinc-400 dark:bg-zinc-500',
    bgColor: 'bg-zinc-50 dark:bg-zinc-900',
    borderColor: 'border-zinc-300 dark:border-zinc-700',
    rank: 0,
  },
  emerging: {
    label: 'Emerging',
    color: 'bg-yellow-400 dark:bg-yellow-500',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-300 dark:border-yellow-700',
    rank: 1,
  },
  partial: {
    label: 'Partial',
    color: 'bg-amber-500 dark:bg-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-300 dark:border-amber-700',
    rank: 2,
  },
  strong: {
    label: 'Strong',
    color: 'bg-green-500 dark:bg-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-300 dark:border-green-700',
    rank: 3,
  },
  confirmed: {
    label: 'Confirmed',
    color: 'bg-emerald-600 dark:bg-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    rank: 4,
  },
};

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateShort(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

export function AssessmentTimeline({ assessments }: AssessmentTimelineProps) {
  // Reverse to chronological, deduplicate consecutive same assessments
  const timeline = useMemo(() => {
    const sorted = [...assessments].reverse();
    const deduped: AssessmentPoint[] = [];
    for (const point of sorted) {
      if (deduped.length === 0 || deduped[deduped.length - 1].assessment !== point.assessment) {
        deduped.push(point);
      }
    }
    return deduped;
  }, [assessments]);

  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground py-4">
        No qualitative assessments yet
      </div>
    );
  }

  // Show trend direction
  const first = ASSESSMENT_LEVELS[timeline[0]?.assessment]?.rank ?? 0;
  const last = ASSESSMENT_LEVELS[timeline[timeline.length - 1]?.assessment]?.rank ?? 0;
  const trendLabel = last > first ? 'Strengthening' : last < first ? 'Weakening' : timeline.length > 1 ? 'Stable' : '';

  return (
    <div className="space-y-2">
      {/* Compact dot timeline */}
      <div className="flex items-center gap-1">
        {timeline.map((point, i) => {
          const level = ASSESSMENT_LEVELS[point.assessment] || ASSESSMENT_LEVELS.no_evidence;
          return (
            <div key={i} className="flex items-center gap-1">
              {/* Connector line */}
              {i > 0 && (
                <div className="w-3 h-px bg-border" />
              )}
              {/* Dot with tooltip via title */}
              <div className="group relative">
                <div
                  className={`w-3 h-3 rounded-full ${level.color} ring-2 ring-background`}
                  title={`${formatDateShort(point.date)}: ${level.label}${point.summary ? ` — ${point.summary}` : ''}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Date range + trend */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {formatDateShort(timeline[0].date)}
          {timeline.length > 1 && ` → ${formatDateShort(timeline[timeline.length - 1].date)}`}
        </span>
        {trendLabel && (
          <span className={`text-[10px] font-medium ${
            last > first ? 'text-green-600 dark:text-green-400' :
            last < first ? 'text-amber-600 dark:text-amber-400' :
            'text-muted-foreground'
          }`}>
            {trendLabel}
          </span>
        )}
      </div>

      {/* Latest assessment card */}
      {timeline.length > 0 && (() => {
        const latest = timeline[timeline.length - 1];
        const level = ASSESSMENT_LEVELS[latest.assessment] || ASSESSMENT_LEVELS.no_evidence;
        return (
          <div className={`rounded-md border px-2.5 py-1.5 ${level.bgColor} ${level.borderColor}`}>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${level.color}`} />
              <span className="text-xs font-medium">{level.label}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {formatDateShort(latest.date)}
              </span>
            </div>
            {latest.summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {latest.summary}
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
