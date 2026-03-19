"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDownIcon, FileTextIcon, ExternalLinkIcon, AlertCircleIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ThesisClaimsContextSummary } from "@/app/api/theses/[id]/claims-context/route";

interface ThesisClaimsContextProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
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
      className={cn("text-xs", classMap[type] ?? "bg-muted text-muted-foreground")}
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

export function ThesisClaimsContext({ thesisId, thesisType, className }: ThesisClaimsContextProps) {
  const [isExpanded, setIsExpanded] = useState(true); // Default expanded for research context
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<ThesisClaimsContextSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContext = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/theses/${thesisId}/claims-context?type=${thesisType}`);
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
  }, [thesisId, thesisType]);

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
    return (
      <div className={cn("rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3", className)}>
        <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
          <AlertCircleIcon className="h-4 w-4" />
          <span>{error || "Failed to load claims"}</span>
        </div>
      </div>
    );
  }

  // No claims linked - show research prompt
  if (data.claims.length === 0) {
    return (
      <div className={cn("rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4", className)}>
        <div className="flex items-start gap-3">
          <SearchIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">No evidence claims yet</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              This thesis needs research to build supporting evidence. Process transcripts or articles using the{" "}
              <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">/process-transcript</code> skill, then link the resulting claims to this thesis.
            </p>
            <Link
              href="/research"
              className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 font-medium hover:underline mt-2"
            >
              Go to Research Browser
              <ExternalLinkIcon className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { summary, claims } = data;
  const thesisUrl = thesisType === 'macro'
    ? `/macro-theses/${thesisId}`
    : `/asset-theses/${thesisId}`;

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      {/* Summary Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <FileTextIcon className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Evidence Claims</span>
            <span className="text-xs text-muted-foreground">|</span>
            <span className="text-sm text-muted-foreground">
              {data.ticker || data.thesisTitle || 'Thesis'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
        </div>
      </button>

      {/* Expanded Claims List */}
      {isExpanded && (
        <div className="border-t border-border divide-y divide-border max-h-60 overflow-y-auto">
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

          {/* Link to full thesis page */}
          <div className="px-4 py-2 bg-muted sticky bottom-0">
            <Link
              href={thesisUrl}
              className="text-xs text-blue-600 hover:underline"
            >
              View full thesis with all claims →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
