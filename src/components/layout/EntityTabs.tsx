'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { EntityTab } from '@/lib/types/entity-tabs';

// Re-export for convenience
export type { EntityTab } from '@/lib/types/entity-tabs';
export { createEntityTabs } from '@/lib/types/entity-tabs';

interface EntityTabsProps {
  tabs: EntityTab[];
  className?: string;
}

/**
 * Reusable URL-based tab navigation component.
 * Uses pathname matching to determine active state.
 *
 * @example
 * ```tsx
 * const tabs = [
 *   { id: 'overview', label: 'Overview', href: `/macro-theses/${id}/overview` },
 *   { id: 'evidence', label: 'Evidence', href: `/macro-theses/${id}/evidence` },
 *   { id: 'execution', label: 'Execution', href: `/macro-theses/${id}/execution` },
 * ];
 * <EntityTabs tabs={tabs} />
 * ```
 */
export function EntityTabs({ tabs, className }: EntityTabsProps) {
  const pathname = usePathname();

  // Find active tab by matching pathname
  const activeTab = tabs.find((tab) => pathname === tab.href)?.id ?? tabs[0]?.id;

  return (
    <div
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            data-state={isActive ? 'active' : 'inactive'}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
