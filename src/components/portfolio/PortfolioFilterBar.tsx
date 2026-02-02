"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AssetClassFilter = "all" | "STK" | "OPT" | "CRYPTO" | "CASH";

interface PortfolioFilterBarProps {
  assetClassFilter: AssetClassFilter;
  onAssetClassFilterChange: (filter: AssetClassFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  positionCount: number;
  strategyCount: number;
}

export function PortfolioFilterBar({
  assetClassFilter,
  onAssetClassFilterChange,
  searchQuery,
  onSearchQueryChange,
  positionCount,
  strategyCount,
}: PortfolioFilterBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        if (searchQuery) {
          onSearchQueryChange("");
        } else {
          searchRef.current?.blur();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery, onSearchQueryChange]);

  const filterButtons: { label: string; value: AssetClassFilter }[] = [
    { label: "All", value: "all" },
    { label: "Stocks", value: "STK" },
    { label: "Options", value: "OPT" },
    { label: "Crypto", value: "CRYPTO" },
    { label: "Cash", value: "CASH" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Quick filter buttons */}
      <div className="flex rounded-lg border bg-muted/50 p-0.5">
        {filterButtons.map((btn) => (
          <button
            key={btn.value}
            type="button"
            onClick={() => onAssetClassFilterChange(btn.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              assetClassFilter === btn.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search positions... (/)"
          className="h-8 w-full rounded-md border bg-background pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchQueryChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Counts */}
      <span className="text-xs text-muted-foreground">
        {strategyCount} strategies, {positionCount} positions
      </span>
    </div>
  );
}
