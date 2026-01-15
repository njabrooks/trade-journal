"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface StrategyTabsProps {
  strategyId: string;
}

const TABS = [
  { href: (id: string) => `/strategies/${id}/performance`, label: "Performance", id: "performance" },
  { href: (id: string) => `/strategies/${id}/triage`, label: "Triage", id: "triage" },
  { href: (id: string) => `/strategies/${id}/signals`, label: "Signals", id: "signals" },
  { href: (id: string) => `/strategies/${id}/blotter`, label: "Blotter", id: "blotter" },
] as const;

export function StrategyTabs({ strategyId }: StrategyTabsProps) {
  const pathname = usePathname();
  
  // Determine active tab based on pathname
  const activeTab = TABS.find(tab => pathname === tab.href(strategyId))?.id || 
                   (pathname === `/strategies/${strategyId}` ? "triage" : null);

  return (
    <div className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
      {TABS.map((tab) => {
        const href = tab.href(strategyId);
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={href}
            className={cn(
              "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            data-state={isActive ? "active" : "inactive"}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

