'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

type EntityType = 'macro_thesis' | 'asset_thesis' | 'claim' | 'signal' | 'strategy' | 'intelligence'

interface EntityBadgeProps {
  entityType: EntityType
  id: string
  title: string
  status?: string
  href?: string
  size?: 'sm' | 'md'
  className?: string
}

const entityColorMap: Record<EntityType, string> = {
  macro_thesis: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  asset_thesis: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  claim: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  signal: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  strategy: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  intelligence: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
}

const entityDotColorMap: Record<EntityType, string> = {
  macro_thesis: 'bg-violet-500',
  asset_thesis: 'bg-blue-500',
  claim: 'bg-emerald-500',
  signal: 'bg-amber-500',
  strategy: 'bg-slate-500',
  intelligence: 'bg-cyan-500',
}

const entityLabelMap: Record<EntityType, string> = {
  macro_thesis: 'Macro',
  asset_thesis: 'Asset',
  claim: 'Claim',
  signal: 'Signal',
  strategy: 'Strategy',
  intelligence: 'Intel',
}

const statusDotColorMap: Record<string, string> = {
  developing: 'bg-yellow-400',
  monitoring: 'bg-blue-400',
  active: 'bg-green-400',
  draft: 'bg-gray-400',
  complete: 'bg-emerald-500',
  rejected: 'bg-red-400',
}

const entityRouteMap: Record<EntityType, string> = {
  macro_thesis: '/theses',
  asset_thesis: '/asset-theses',
  claim: '/research/claims',
  signal: '/signals',
  strategy: '/strategies',
  intelligence: '/intelligence',
}

function EntityBadge({
  entityType,
  id,
  title,
  status,
  href,
  size = 'sm',
  className,
}: EntityBadgeProps) {
  const resolvedHref = href ?? `${entityRouteMap[entityType]}/${id}`
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5 gap-1' : 'text-sm px-2 py-1 gap-1.5'
  const dotSize = size === 'sm' ? 'size-1.5' : 'size-2'

  return (
    <Link
      href={resolvedHref}
      className={cn(
        'inline-flex items-center rounded-md font-medium transition-opacity hover:opacity-80',
        entityColorMap[entityType],
        sizeClasses,
        className,
      )}
    >
      <span className={cn('shrink-0 rounded-full', entityDotColorMap[entityType], dotSize)} />
      <span className="shrink-0">{entityLabelMap[entityType]}</span>
      <span className="truncate">{title}</span>
      {status && statusDotColorMap[status] && (
        <span className={cn('shrink-0 rounded-full', statusDotColorMap[status], dotSize)} />
      )}
    </Link>
  )
}

export { EntityBadge }
export type { EntityType, EntityBadgeProps }
