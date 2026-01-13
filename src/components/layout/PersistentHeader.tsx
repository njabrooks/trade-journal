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
  "macro-theses": "Macro Theses",
  "asset-theses": "Asset Theses",
  research: "Research",
  claims: "Claims",
  signals: "Signals",
  journal: "Journal",
};

// Helper to check if a string looks like a UUID
function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export function PersistentHeader() {
  const pathname = usePathname();
  const [entityLabels, setEntityLabels] = useState<Record<string, string>>({});

  // Extract entity IDs from various routes
  const strategyMatch = pathname.match(/^\/strategies\/([^/]+)/);
  const macroThesisMatch = pathname.match(/^\/macro-theses\/([^/]+)/);
  const assetThesisMatch = pathname.match(/^\/asset-theses\/([^/]+)/);
  const researchMatch = pathname.match(/^\/research\/([^/]+)/);
  const claimMatch = pathname.match(/^\/claims\/([^/]+)/);

  const strategyId = strategyMatch?.[1];
  const macroThesisId = macroThesisMatch?.[1];
  const assetThesisId = assetThesisMatch?.[1];
  const researchId = researchMatch?.[1];
  const claimId = claimMatch?.[1];

  // Fetch entity labels
  useEffect(() => {
    const fetchLabels = async () => {
      const newLabels: Record<string, string> = {};

      // Fetch strategy label
      if (strategyId && isUuid(strategyId)) {
        try {
          const res = await fetch(`/api/strategies?id=${strategyId}`);
          const data = await res.json();
          if (data?.autoDerivedLabel || data?.strategyKey) {
            newLabels[strategyId] = data.autoDerivedLabel || data.strategyKey;
          }
        } catch { /* ignore */ }
      }

      // Fetch macro thesis title
      if (macroThesisId && isUuid(macroThesisId)) {
        try {
          const res = await fetch(`/api/macro-theses/${macroThesisId}`);
          const data = await res.json();
          if (data?.title) {
            newLabels[macroThesisId] = data.title;
          }
        } catch { /* ignore */ }
      }

      // Fetch asset thesis title
      if (assetThesisId && isUuid(assetThesisId)) {
        try {
          const res = await fetch(`/api/asset-theses/${assetThesisId}`);
          const data = await res.json();
          if (data?.title) {
            newLabels[assetThesisId] = data.title;
          }
        } catch { /* ignore */ }
      }

      // Fetch research artifact title
      if (researchId && isUuid(researchId)) {
        try {
          const res = await fetch(`/api/research/artifacts/${researchId}`);
          const data = await res.json();
          if (data?.title) {
            newLabels[researchId] = data.title;
          }
        } catch { /* ignore */ }
      }

      // Fetch claim title
      if (claimId && isUuid(claimId)) {
        try {
          const res = await fetch(`/api/claims/${claimId}`);
          const data = await res.json();
          if (data?.title) {
            newLabels[claimId] = data.title;
          }
        } catch { /* ignore */ }
      }

      setEntityLabels(newLabels);
    };

    fetchLabels();
  }, [strategyId, macroThesisId, assetThesisId, researchId, claimId]);

  // Build breadcrumb items from pathname
  const pathSegments = pathname.split("/").filter(Boolean);
  const breadcrumbItems = pathSegments.map((segment, index) => {
    const href = "/" + pathSegments.slice(0, index + 1).join("/");
    let label = pathLabelMap[segment] || segment;

    // Replace UUID with fetched label if available
    if (isUuid(segment) && entityLabels[segment]) {
      label = entityLabels[segment];
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

