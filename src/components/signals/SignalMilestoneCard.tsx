'use client';

import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { ASSESSMENT_LEVELS, formatDateShort } from './signal-constants';

interface SignalMilestoneCardProps {
  triggered: boolean;
  lastChecked: string | null;
  evidenceSummary?: string | null;
  latestAssessment?: string | null;
  signalType: string; // 'confirmation' | 'invalidation' | 'completion'
}

export function SignalMilestoneCard({
  triggered,
  lastChecked,
  evidenceSummary,
  latestAssessment,
  signalType,
}: SignalMilestoneCardProps) {
  const isInvalidation = signalType === 'invalidation' || signalType === 'warning';
  const level = latestAssessment ? ASSESSMENT_LEVELS[latestAssessment] : null;

  if (triggered) {
    const color = isInvalidation
      ? 'border-red-500/30 bg-red-500/5'
      : 'border-emerald-500/30 bg-emerald-500/5';
    const iconColor = isInvalidation ? 'text-red-500' : 'text-emerald-500';

    return (
      <div className={`bg-card rounded-lg border-2 ${color} p-4`}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className={`w-5 h-5 ${iconColor}`} />
          <span className={`text-sm font-semibold ${iconColor}`}>
            {isInvalidation ? 'Triggered' : 'Confirmed'}
          </span>
          {lastChecked && (
            <span className="text-xs text-muted-foreground ml-auto">
              {formatDateShort(lastChecked)}
            </span>
          )}
        </div>
        {evidenceSummary && (
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {evidenceSummary}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Circle className="w-5 h-5 text-muted-foreground/40" />
        <span className="text-sm text-muted-foreground">Not triggered</span>
        {/* Latest qualitative assessment */}
        {level && (
          <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${level.bgColor} ${level.borderColor}`}>
            <div className={`w-2 h-2 rounded-full ${level.dotColor}`} />
            <span className={`text-xs font-medium ${level.textColor}`}>{level.label}</span>
          </div>
        )}
        {lastChecked && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-auto">
            <Clock className="w-3 h-3" />
            Updated {formatDateShort(lastChecked)}
          </span>
        )}
      </div>
      {evidenceSummary && (
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-2">
          {evidenceSummary}
        </p>
      )}
    </div>
  );
}
