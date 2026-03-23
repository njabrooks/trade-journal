'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EntityBadge, type EntityType } from './entity-badge'

interface RelationshipItem {
  entityType: EntityType
  id: string
  title: string
  status?: string
  relationshipType?: string
  direction?: string
}

interface RelationshipPanelProps {
  relationships: RelationshipItem[]
  groupBy?: 'type' | 'relationship'
  emptyMessage?: string
  className?: string
}

const entityLabelPlural: Record<EntityType, string> = {
  macro_thesis: 'Macro Theses',
  asset_thesis: 'Asset Theses',
  claim: 'Claims',
  signal: 'Signals',
  strategy: 'Strategies',
  intelligence: 'Intelligence',
}

const COLLAPSE_THRESHOLD = 3

function RelationshipGroup({
  label,
  items,
  defaultExpanded,
}: {
  label: string
  items: RelationshipItem[]
  defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const count = items.length

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        {label}
        <span className="font-normal">({count})</span>
      </button>
      {expanded && (
        <div className="ml-1 flex flex-col gap-1 py-1">
          {items.map((item) => (
            <EntityBadge
              key={item.id}
              entityType={item.entityType}
              id={item.id}
              title={item.title}
              status={item.status}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RelationshipPanel({
  relationships,
  groupBy = 'type',
  emptyMessage = 'No relationships',
  className,
}: RelationshipPanelProps) {
  if (relationships.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground py-3', className)}>
        {emptyMessage}
      </div>
    )
  }

  const grouped = new Map<string, RelationshipItem[]>()

  for (const rel of relationships) {
    const key = groupBy === 'type' ? rel.entityType : (rel.relationshipType ?? 'other')
    const group = grouped.get(key)
    if (group) {
      group.push(rel)
    } else {
      grouped.set(key, [rel])
    }
  }

  // Sort groups: for 'type' grouping, use a stable entity type order
  const entityOrder: EntityType[] = ['macro_thesis', 'asset_thesis', 'claim', 'signal', 'strategy', 'intelligence']
  const sortedEntries = Array.from(grouped.entries()).sort(([a], [b]) => {
    if (groupBy === 'type') {
      return entityOrder.indexOf(a as EntityType) - entityOrder.indexOf(b as EntityType)
    }
    return a.localeCompare(b)
  })

  return (
    <div className={cn('space-y-2', className)}>
      {sortedEntries.map(([key, items]) => {
        const label = groupBy === 'type'
          ? entityLabelPlural[key as EntityType] ?? key
          : key.charAt(0).toUpperCase() + key.slice(1)

        return (
          <RelationshipGroup
            key={key}
            label={label}
            items={items}
            defaultExpanded={items.length <= COLLAPSE_THRESHOLD}
          />
        )
      })}
    </div>
  )
}

export { RelationshipPanel }
export type { RelationshipItem, RelationshipPanelProps }
