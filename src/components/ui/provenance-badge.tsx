'use client'

import { cn } from '@/lib/utils'

type ProvenanceSource = 'user' | 'skill' | 'automation' | 'thesis_monitor' | 'intelligence_routing' | 'research_routing'

interface ProvenanceBadgeProps {
  source: ProvenanceSource
  detail?: string
  className?: string
}

const sourceConfig: Record<ProvenanceSource, { label: string; classes: string }> = {
  user: {
    label: 'Manual',
    classes: 'text-muted-foreground bg-muted',
  },
  skill: {
    label: 'Skill',
    classes: 'text-indigo-600 bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/30',
  },
  automation: {
    label: 'Auto',
    classes: 'text-amber-600 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30',
  },
  thesis_monitor: {
    label: 'Thesis Monitor',
    classes: 'text-violet-600 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/30',
  },
  intelligence_routing: {
    label: 'Intel Route',
    classes: 'text-cyan-600 bg-cyan-100 dark:text-cyan-300 dark:bg-cyan-900/30',
  },
  research_routing: {
    label: 'Research',
    classes: 'text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30',
  },
}

function ProvenanceBadge({ source, detail, className }: ProvenanceBadgeProps) {
  const config = sourceConfig[source]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium leading-tight',
        config.classes,
        className,
      )}
    >
      {config.label}
      {detail && (
        <span className="opacity-70">: {detail}</span>
      )}
    </span>
  )
}

export { ProvenanceBadge }
export type { ProvenanceSource, ProvenanceBadgeProps }
