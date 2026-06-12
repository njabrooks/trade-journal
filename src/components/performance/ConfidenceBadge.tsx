'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { RealizedConfidence } from '@/db/queries/thesisPerformance';

/**
 * W4/W5 rule: realized PnL figures with confidence below 'full' are partial
 * views, not truth (docs/v2/05-w4-realized-pnl-design.md) — they must never
 * render unbadged. 'full' renders nothing.
 */
const CONFIG: Record<
  Exclude<RealizedConfidence, 'full'>,
  { label: string; classes: string; tooltip: string }
> = {
  partial_history: {
    label: 'partial history',
    classes:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    tooltip:
      'Linked trade history is incomplete — realized PnL is a partial view, not the full figure.',
  },
  no_trades: {
    label: 'no trade history',
    classes: 'bg-muted text-muted-foreground',
    tooltip:
      'No linked trades — realized PnL cannot be computed; only unrealized marks are shown.',
  },
};

export function ConfidenceBadge({
  confidence,
  className,
}: {
  confidence: RealizedConfidence | null | undefined;
  className?: string;
}) {
  if (!confidence || confidence === 'full') return null;
  const config = CONFIG[confidence];

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
