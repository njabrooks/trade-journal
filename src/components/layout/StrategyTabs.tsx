'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { EntityTab } from '@/lib/types/entity-tabs';

interface StrategyTabsProps {
  strategyId: string;
}

/**
 * Create strategy-specific tabs.
 * Uses Overview/Evidence/Execution naming for consistency with other entities,
 * but maps to strategy-specific content.
 */
function createStrategyTabs(strategyId: string): EntityTab[] {
  return [
    { id: 'overview', label: 'Overview', href: `/strategies/${strategyId}/overview` },
    { id: 'journal', label: 'Journal', href: `/strategies/${strategyId}/journal` },
  ];
}

export function StrategyTabs({ strategyId }: StrategyTabsProps) {
  const pathname = usePathname();
  const tabs = createStrategyTabs(strategyId);

  // Determine active tab based on pathname
  const activeTab = tabs.find((tab) => pathname === tab.href)?.id ?? tabs[0]?.id;

  return (
    <div className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
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

