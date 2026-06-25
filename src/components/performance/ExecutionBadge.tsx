'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Execution-quality verdict for the retrospective's second axis (docs/v2/07 §4d):
 * did we capture the P&L that was available? Distinct from the belief verdict —
 * a right call can be poorly executed. Renders nothing when unscored (null).
 */
const CONFIG: Record<string, { label: string; classes: string; tooltip: string }> = {
  excellent: {
    label: 'execution: excellent',
    classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    tooltip: 'Captured most of the favorable excursion — exited near the peak.',
  },
  good: {
    label: 'execution: good',
    classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    tooltip: 'Captured a solid share of the available move.',
  },
  fair: {
    label: 'execution: fair',
    classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    tooltip: 'Left meaningful P&L on the table relative to the peak.',
  },
  poor: {
    label: 'execution: poor',
    classes: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    tooltip: 'Gave back most of a real gain, or ignored a flagged turn — an exit-timing lesson.',
  },
};

export function ExecutionBadge({
  quality,
  className,
}: {
  quality: string | null | undefined;
  className?: string;
}) {
  if (!quality) return null;
  const config = CONFIG[quality];
  if (!config) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${config.classes} ${className ?? ''}`}
        >
          {config.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{config.tooltip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Belief verdict — the FIRST retrospective axis (was the thesis right?). Pairs with
 * ExecutionBadge so the two axes always read together.
 */
const BELIEF_CONFIG: Record<string, { classes: string; tooltip: string }> = {
  validated: {
    classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    tooltip: 'The core argument played out — the belief was right.',
  },
  invalidated: {
    classes: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    tooltip: 'The core argument did not play out — the belief was wrong.',
  },
  partial: {
    classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    tooltip: 'The thesis was partly right — some legs held, others did not.',
  },
  ongoing: {
    classes: 'bg-muted text-muted-foreground',
    tooltip: 'Outcome not yet judged.',
  },
};

export function BeliefBadge({
  outcome,
  className,
}: {
  outcome: string | null | undefined;
  className?: string;
}) {
  if (!outcome) return null;
  const config = BELIEF_CONFIG[outcome] ?? BELIEF_CONFIG.ongoing;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${config.classes} ${className ?? ''}`}
        >
          {outcome}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{config.tooltip}</TooltipContent>
    </Tooltip>
  );
}
