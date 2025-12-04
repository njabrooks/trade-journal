"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/ingestion/flex", label: "Flex", id: "flex" },
  { href: "/admin/ingestion/underlyings-iv", label: "IV History", id: "underlyings-iv" },
] as const;

export function IngestionTabs() {
  const pathname = usePathname();
  
  // Determine active tab based on pathname
  const activeTab = TABS.find(tab => pathname === tab.href || pathname.startsWith(tab.href + "/"))?.id || 
                   (pathname.startsWith("/admin/ingestion/flex") ? "flex" : 
                    pathname.startsWith("/admin/ingestion/underlyings-iv") ? "underlyings-iv" : null);

  return (
    <div className="flex items-center gap-1">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              isActive
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

