'use client';

import { useMemo } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ASSESSMENT_LEVELS, formatDateShort } from './signal-constants';

interface AssessmentPoint {
  date: string;
  assessment: string;
  summary: string | null;
}

interface AssessmentTimelineProps {
  assessments: AssessmentPoint[];
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

  // Show trend: latest assessment label + direction arrow from prior
  const latest = timeline[timeline.length - 1];
  const prior = timeline.length > 1 ? timeline[timeline.length - 2] : null;
  const latestRank = ASSESSMENT_LEVELS[latest?.assessment]?.rank ?? 0;
  const priorRank = prior ? (ASSESSMENT_LEVELS[prior.assessment]?.rank ?? 0) : latestRank;
  const trendArrow = latestRank > priorRank ? '↑' : latestRank < priorRank ? '↓' : '';
  const latestLevel = ASSESSMENT_LEVELS[latest?.assessment] || ASSESSMENT_LEVELS.neutral;

  return (
    <div className="space-y-2">
      {/* Compact dot timeline */}
      <div className="flex items-center gap-1">
        {timeline.map((point, i) => {
          const level = ASSESSMENT_LEVELS[point.assessment] || ASSESSMENT_LEVELS.neutral;
          return (
            <div key={i} className="flex items-center gap-1">
              {/* Connector line */}
              {i > 0 && (
                <div className="w-3 h-px bg-border" />
              )}
              {/* Dot with Radix tooltip */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`w-3 h-3 rounded-full ${level.dotColor} ring-2 ring-background cursor-default`}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={6}
                  className="bg-popover text-popover-foreground border shadow-md max-w-[260px] px-3 py-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${level.dotColor}`} />
                      <span className="text-xs font-medium">{level.label}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{formatDateShort(point.date)}</span>
                    </div>
                    {point.summary && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {point.summary}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>

      {/* Date range + trend */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {formatDateShort(timeline[0].date)}
          {timeline.length > 1 && ` → ${formatDateShort(timeline[timeline.length - 1].date)}`}
        </span>
        {timeline.length > 0 && (
          <span className={`text-xs font-medium ${latestLevel.textColor}`}>
            {trendArrow && <span className="mr-0.5">{trendArrow}</span>}
            {latestLevel.label}
          </span>
        )}
      </div>

      {/* Latest assessment card */}
      {timeline.length > 0 && (() => {
        const latest = timeline[timeline.length - 1];
        const level = ASSESSMENT_LEVELS[latest.assessment] || ASSESSMENT_LEVELS.neutral;
        return (
          <div className={`rounded-md border px-2.5 py-1.5 ${level.bgColor} ${level.borderColor}`}>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${level.dotColor}`} />
              <span className="text-xs font-medium">{level.label}</span>
              <span className="text-xs text-muted-foreground ml-auto">
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
