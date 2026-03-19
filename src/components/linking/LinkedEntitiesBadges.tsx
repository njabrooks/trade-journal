'use client';

/**
 * LinkedEntitiesBadges - Reusable component for displaying linked entities
 *
 * Features:
 * - Color-coded badges by entity type (purple=Macro, blue=Asset, green=Strategy)
 * - Smart truncation: Show first entity + "+X more" in collapsed rows
 * - Clicking "+X more" expands the row (same as chevron button)
 * - All badges clickable to navigate to detail pages
 * - Optional relationship type badges (Claims only)
 *
 * Based on UnifiedClaimsBrowser pattern (lines 589-622)
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { LinkedEntity } from '@/lib/linking/types';

interface LinkedEntitiesBadgesProps {
  entities: LinkedEntity[];
  isExpanded: boolean; // Pass from parent row state
  onExpand: () => void; // Triggers row expansion (same as chevron button)
  maxVisibleWhenCollapsed?: number; // Default 1
  emptyText?: string; // Default "Not linked"
  showRelationshipType?: boolean; // Default false (Claims only)
}

export function LinkedEntitiesBadges({
  entities,
  isExpanded,
  onExpand,
  maxVisibleWhenCollapsed = 1,
  emptyText = 'Not linked',
  showRelationshipType = false,
}: LinkedEntitiesBadgesProps) {
  // No entities - show empty state
  if (entities.length === 0) {
    return <span className="text-xs text-muted-foreground">{emptyText}</span>;
  }

  // Determine which entities to show
  const visibleEntities = isExpanded ? entities : entities.slice(0, maxVisibleWhenCollapsed);
  const remainingCount = entities.length - maxVisibleWhenCollapsed;
  const showMoreBadge = !isExpanded && remainingCount > 0;

  // Get badge color by entity type
  const getEntityBadgeColor = (type: LinkedEntity['type']) => {
    switch (type) {
      case 'macro':
        return 'bg-violet-500/15 text-violet-600 dark:text-violet-400';
      case 'asset':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
      case 'strategy':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Get entity type label
  const getEntityTypeLabel = (type: LinkedEntity['type']) => {
    switch (type) {
      case 'macro':
        return 'Macro';
      case 'asset':
        return 'Asset';
      case 'strategy':
        return 'Strategy';
      default:
        return '';
    }
  };

  // Get detail page URL
  const getDetailUrl = (entity: LinkedEntity) => {
    switch (entity.type) {
      case 'macro':
        return `/macro-theses/${entity.id}`;
      case 'asset':
        return `/asset-theses/${entity.id}`;
      case 'strategy':
        return `/strategies/${entity.id}`;
      default:
        return '#';
    }
  };

  // Get relationship type badge color
  const getRelationshipBadgeColor = (relationshipType?: string) => {
    switch (relationshipType) {
      case 'supports':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'refutes':
        return 'bg-destructive/15 text-destructive';
      case 'foundation':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className={isExpanded ? "space-y-1" : "flex items-center gap-1 overflow-hidden"}>
      {visibleEntities.map((entity, index) => (
        <span key={entity.id} className={isExpanded ? "block" : "inline-flex items-center gap-1 shrink-0"}>
          <Link
            href={getDetailUrl(entity)}
            className={`text-sm text-foreground hover:text-blue-600 hover:underline transition-colors ${isExpanded ? 'line-clamp-1' : 'truncate max-w-[200px]'}`}
            title={entity.title}
          >
            {showRelationshipType && entity.relationshipType && (
              <Badge className={`${getRelationshipBadgeColor(entity.relationshipType)} text-xs mr-1`}>
                {entity.relationshipType}
              </Badge>
            )}
            {entity.title}
          </Link>
          {!isExpanded && index < visibleEntities.length - 1 && !showMoreBadge && <span className="text-muted-foreground">,</span>}
        </span>
      ))}

      {/* "+X" Badge - Clickable to expand row */}
      {showMoreBadge && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onExpand();
          }}
          title={`Show all ${entities.length} linked entities:\n${entities.slice(maxVisibleWhenCollapsed).map(e => `• ${e.title}`).join('\n')}`}
          className="text-xs text-muted-foreground hover:text-blue-600 font-medium cursor-pointer shrink-0 ml-1 group"
        >
          <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 group-hover:underline text-xs transition-colors">
            +{remainingCount}
          </Badge>
        </button>
      )}
    </div>
  );
}
