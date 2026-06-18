'use client'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

export type LifecyclePhase = 'draft' | 'developing' | 'monitoring' | 'closed' | 'complete' | 'rejected'

interface LifecycleBadgeProps {
  phase: string
  size?: 'sm' | 'md' | 'lg'
  showTooltip?: boolean
  className?: string
}

const phaseConfig: Record<LifecyclePhase, { label: string; classes: string; dotClass: string; tooltip?: string }> = {
  draft: {
    label: 'Draft',
    classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
    dotClass: 'bg-gray-400',
  },
  developing: {
    label: 'Developing',
    classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    dotClass: 'bg-amber-400',
    tooltip: 'Accumulating claims. Build core argument to transition to monitoring.',
  },
  monitoring: {
    label: 'Monitoring',
    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    dotClass: 'bg-blue-400',
    tooltip: 'Tracking signals. Intelligence is evaluated against active signals.',
  },
  closed: {
    label: 'Closed',
    classes: 'bg-slate-200 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
    dotClass: 'bg-slate-400',
    tooltip: 'Was expressed, now flat. Retained for journal/analysis; reopens automatically if a position is re-established.',
  },
  complete: {
    label: 'Complete',
    classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    dotClass: 'bg-red-400',
  },
}

const sizeClasses: Record<'sm' | 'md' | 'lg', { badge: string; dot: string }> = {
  sm: { badge: 'text-xs px-2 py-0.5 gap-1.5', dot: 'size-1.5' },
  md: { badge: 'text-sm px-2.5 py-1 gap-1.5', dot: 'size-2' },
  lg: { badge: 'text-base px-3 py-1.5 gap-2', dot: 'size-2.5' },
}

function LifecycleBadge({
  phase,
  size = 'md',
  showTooltip = true,
  className,
}: LifecycleBadgeProps) {
  const config = phaseConfig[phase as LifecyclePhase] ?? phaseConfig.draft
  const sizes = sizeClasses[size]

  const badge = (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        config.classes,
        sizes.badge,
        className,
      )}
    >
      <span className={cn('shrink-0 rounded-full', config.dotClass, sizes.dot)} />
      {config.label}
    </span>
  )

  if (showTooltip && config.tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{config.tooltip}</TooltipContent>
      </Tooltip>
    )
  }

  return badge
}

export { LifecycleBadge }
export type { LifecycleBadgeProps }
