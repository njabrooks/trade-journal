"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDownIcon, FileTextIcon, ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ClaimsContextSummary } from "@/app/api/strategies/[id]/claims-context/route";

interface ClaimsContextProps {
  strategyId: string | null;
  className?: string;
}

function MappingTypeBadge({ type }: { type: string }) {
  const classMap: Record<string, string> = {
    supports: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
    refutes: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
    foundation: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px]", classMap[type] ?? "bg-muted text-muted-foreground")}
    >
      {type}
    </Badge>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export function ClaimsContext({ strategyId, className }: ClaimsContextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<ClaimsContextSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!strategyId) return;

    const fetchContext = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/strategies/${strategyId}/claims-context`);
        if (!response.ok) {
          throw new Error("Failed to fetch claims context");
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchContext();
  }, [strategyId]);

  if (!strategyId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={cn("rounded-lg border bg-muted p-3", className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileTextIcon className="h-4 w-4 animate-pulse" />
          <span>Loading evidence context...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  // No asset thesis linked
  if (!data.assetThesisId) {
    return (
      <div className={cn("rounded-lg border bg-muted p-3", className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileTextIcon className="h-4 w-4" />
          <span>No asset thesis linked to this strategy</span>
        </div>
      </div>
    );
  }

  // No claims linked
  if (data.claims.length === 0) {
    return (
      <div className={cn("rounded-lg border bg-muted p-3", className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileTextIcon className="h-4 w-4" />
            <span>
              Linked to{" "}
              <Link
                href={`/asset-theses/${data.assetThesisId}`}
                className="font-medium text-blue-600 hover:underline"
              >
                {data.assetThesisTicker || data.assetThesisTitle}
              </Link>
              {" "}thesis - no claims yet
            </span>
          </div>
        </div>
      </div>
    );
  }

  const { summary, claims } = data;

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      {/* Summary Header - Always visible */}
      <div className="flex items-center justify-between p-3 hover:bg-muted transition-colors">
        <div className="flex items-center gap-3">
          <FileTextIcon className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Evidence Context</span>
            <span className="text-xs text-muted-foreground">|</span>
            <Link
              href={`/asset-theses/${data.assetThesisId}`}
              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
            >
              {data.assetThesisTicker || data.assetThesisTitle}
              <ExternalLinkIcon className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 text-left"
        >
          {/* Evidence Summary Pills */}
          <div className="flex items-center gap-1.5">
            {summary.supports > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {summary.supports} supports
              </span>
            )}
            {summary.refutes > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-900/30 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                {summary.refutes} refutes
              </span>
            )}
            {summary.foundation > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                {summary.foundation} foundation
              </span>
            )}
          </div>

          {/* Last Updated */}
          {summary.lastUpdated && (
            <span className="text-xs text-muted-foreground">
              updated {formatRelativeTime(summary.lastUpdated)}
            </span>
          )}

          <ChevronDownIcon
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Expanded Claims List */}
      {isExpanded && (
        <div className="border-t border-border divide-y divide-border max-h-80 overflow-y-auto">
          {claims.map((claim) => (
            <div key={claim.id} className="px-4 py-3 hover:bg-muted">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <MappingTypeBadge type={claim.mappingType} />
                    <span className="text-xs text-muted-foreground capitalize">
                      {claim.category.replace("_", " ")}
                    </span>
                    {claim.qualifier && (
                      <>
                        <span className="text-xs text-muted-foreground/50">|</span>
                        <span className="text-xs text-muted-foreground">
                          {claim.qualifier} confidence
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-foreground line-clamp-2">{claim.claim}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Link to full detail page */}
          <div className="px-4 py-2 bg-muted sticky bottom-0">
            <Link
              href={`/asset-theses/${data.assetThesisId}`}
              className="text-xs text-blue-600 hover:underline"
            >
              View full thesis detail →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
