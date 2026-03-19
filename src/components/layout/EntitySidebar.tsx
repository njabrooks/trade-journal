'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { InfoRow, InfoRowGroup } from '@/components/ui/info-row';
import { cn } from '@/lib/utils';

export interface SidebarMetadataItem {
  label: string;
  value: React.ReactNode;
}

export interface SidebarRelatedEntity {
  label: string;
  count: number;
  href: string;
  /** Optional: entity type for icon styling */
  type?: 'macro-thesis' | 'asset-thesis' | 'strategy' | 'claim';
}

interface EntitySidebarProps {
  /** Metadata key-value pairs to display in Quick Stats section */
  metadata: SidebarMetadataItem[];
  /** Related entities with counts and links */
  relatedEntities?: SidebarRelatedEntity[];
  /** Optional actions slot (buttons, dropdowns) */
  actions?: React.ReactNode;
  /** Additional sections to render in the accordion */
  additionalSections?: React.ReactNode;
  /** Sections to expand by default */
  defaultExpanded?: string[];
  className?: string;
}

/**
 * Reusable entity detail sidebar with consistent structure.
 * Displays Quick Stats metadata, Related Entities, and optional actions.
 *
 * @example
 * ```tsx
 * <EntitySidebar
 *   metadata={[
 *     { label: 'Status', value: <StatusBadge status="active" /> },
 *     { label: 'Direction', value: 'Bullish' },
 *   ]}
 *   relatedEntities={[
 *     { label: 'Asset Theses', count: 3, href: '#execution', type: 'asset-thesis' },
 *     { label: 'Strategies', count: 5, href: '#execution', type: 'strategy' },
 *   ]}
 * />
 * ```
 */
export function EntitySidebar({
  metadata,
  relatedEntities = [],
  actions,
  additionalSections,
  defaultExpanded = ['quick-stats', 'related'],
  className,
}: EntitySidebarProps) {
  return (
    <div className={cn('sticky top-6 h-fit w-full lg:w-[22rem] self-start', className)}>
      <div className="rounded-lg border bg-card shadow-sm">
        <Accordion
          type="multiple"
          className="w-full"
          defaultValue={defaultExpanded}
        >
          {/* Quick Stats Section */}
          <AccordionItem value="quick-stats" className="border-b">
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline">
              Quick Stats
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <InfoRowGroup>
                {metadata.map((item, index) => (
                  <InfoRow key={index} label={item.label} value={item.value} />
                ))}
              </InfoRowGroup>
            </AccordionContent>
          </AccordionItem>

          {/* Related Entities Section */}
          {relatedEntities.length > 0 && (
            <AccordionItem value="related" className="border-b-0">
              <AccordionTrigger className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline">
                Related
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-1">
                  {relatedEntities.map((entity, index) => (
                    <RelatedEntityLink key={index} entity={entity} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Additional custom sections */}
          {additionalSections}
        </Accordion>

        {/* Actions slot */}
        {actions && (
          <div className="border-t px-4 py-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

function RelatedEntityLink({ entity }: { entity: SidebarRelatedEntity }) {
  const typeColors: Record<string, string> = {
    'macro-thesis': 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    'asset-thesis': 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    'strategy': 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    'claim': 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  };

  const colorClass = entity.type ? typeColors[entity.type] : 'bg-muted text-muted-foreground';

  return (
    <Link
      href={entity.href}
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors group"
    >
      <span className="text-muted-foreground group-hover:text-foreground">{entity.label}</span>
      <span className={cn('inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs font-medium', colorClass)}>
        {entity.count}
      </span>
    </Link>
  );
}
