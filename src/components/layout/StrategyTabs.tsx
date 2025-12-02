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
  { href: (id: string) => `/strategies/${id}/blotter`, label: "Blotter", id: "blotter" },
] as const;

export function StrategyTabs({ strategyId }: StrategyTabsProps) {
  const pathname = usePathname();
  
  // Determine active tab based on pathname
  const activeTab = TABS.find(tab => pathname === tab.href(strategyId))?.id || 
                   (pathname === `/strategies/${strategyId}` ? "triage" : null);

  return (
    <div className="mx-auto max-w-6xl px-6 py-3">
      <div className="flex items-center gap-1">
        {TABS.map((tab) => {
          const href = tab.href(strategyId);
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={href}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:bg-white/50 hover:text-slate-900"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

