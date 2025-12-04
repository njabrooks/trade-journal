"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// Map path segments to readable labels
const pathLabelMap: Record<string, string> = {
  dashboard: "Dashboard",
  portfolio: "Portfolio",
  strategies: "Strategies",
  strategy: "Strategy",
  triage: "Triage",
  blotter: "Blotter",
  performance: "Performance",
  admin: "Admin",
  playbook: "Playbook",
  accounts: "Accounts",
  ingestion: "Ingestion",
  flex: "Flex",
  recompute: "Recompute",
};

export function PersistentHeader() {
  const pathname = usePathname();
  const [strategyLabel, setStrategyLabel] = useState<string | null>(null);
  
  // Extract strategy ID from pathname if we're on a strategy detail page
  const strategyMatch = pathname.match(/^\/strategies\/([^/]+)/);
  const strategyId = strategyMatch?.[1];
  
  // Fetch strategy label when on a strategy detail page
  useEffect(() => {
    if (strategyId && !strategyId.match(/^(performance|triage|blotter)$/)) {
      // Only fetch if it looks like a UUID (not a sub-route)
      fetch(`/api/strategies?id=${strategyId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && (data.autoDerivedLabel || data.strategyKey)) {
            setStrategyLabel(data.autoDerivedLabel || data.strategyKey);
          }
        })
        .catch(() => {
          // Silently fail - will just show the ID
        });
    } else {
      setStrategyLabel(null);
    }
  }, [strategyId]);
  
  // Build breadcrumb items from pathname
  const pathSegments = pathname.split("/").filter(Boolean);
  const breadcrumbItems = pathSegments.map((segment, index) => {
    const href = "/" + pathSegments.slice(0, index + 1).join("/");
    let label = pathLabelMap[segment] || segment;
    
    // Replace strategy ID with strategy label if available
    if (strategyId && segment === strategyId && strategyLabel) {
      label = strategyLabel;
    }
    
    const isLast = index === pathSegments.length - 1;
    
    return { href, label, isLast };
  });

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-7 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="h-6 w-6" />
      <Image
        src="/Capital - Horizontal logo black.svg"
        alt="Capital Logo"
        width={2265}
        height={478}
        className="h-9 w-auto"
        quality={100}
        priority
      />
      <h1 className="text-xs font-semibold">Trade Journal</h1>
      {breadcrumbItems.length > 0 && (
        <Breadcrumb className="ml-4">
          <BreadcrumbList className="text-xs">
            {breadcrumbItems.map((item, index) => (
              <React.Fragment key={item.href}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {item.isLast ? (
                    <BreadcrumbPage className="text-xs">{item.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={item.href} className="text-xs hover:text-foreground">
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
    </header>
  );
}

