"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Account } from "@/db/schema";

export type AssetClassFilter = "all" | "STK" | "OPT" | "CRYPTO" | "CASH";
export type OwnerFilter = "all" | "TTC" | "Nick" | "Maisy" | "Kids";
export type SourceFilter = "all" | "IBKR" | "HyperLiquid" | "CoinbasePrime" | "Deribit" | "Solana" | "Kraken";

// Map Kids to individual owners for filtering
const KIDS_OWNERS = ["Alex", "Lily", "Leo"];

// Map source filter values to broker names
const SOURCE_TO_BROKER: Record<SourceFilter, string | null> = {
  all: null,
  IBKR: "IBKR",
  HyperLiquid: "HyperLiquid",
  CoinbasePrime: "CoinbasePrime",
  Deribit: "Deribit",
  Solana: "Solana",
  Kraken: "Kraken",
};

interface PortfolioUnifiedFilterBarProps {
  accounts: Account[];
  selectedAccountIds: string[];
  onAccountSelectionChange: (accountIds: string[]) => void;
  assetClassFilter: AssetClassFilter;
  onAssetClassFilterChange: (filter: AssetClassFilter) => void;
  ownerFilter: OwnerFilter;
  onOwnerFilterChange: (filter: OwnerFilter) => void;
  sourceFilter: SourceFilter;
  onSourceFilterChange: (filter: SourceFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  positionCount: number;
  strategyCount: number;
}

export function PortfolioUnifiedFilterBar({
  accounts,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  selectedAccountIds,
  onAccountSelectionChange,
  assetClassFilter,
  onAssetClassFilterChange,
  ownerFilter,
  onOwnerFilterChange,
  sourceFilter,
  onSourceFilterChange,
  searchQuery,
  onSearchQueryChange,
  positionCount,
  strategyCount,
}: PortfolioUnifiedFilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        e.preventDefault();
        setShowFilters(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        if (searchQuery) {
          onSearchQueryChange("");
        } else if (showFilters) {
          setShowFilters(false);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery, onSearchQueryChange, showFilters]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (assetClassFilter !== "all") count++;
    if (ownerFilter !== "all") count++;
    if (sourceFilter !== "all") count++;
    if (searchQuery) count++;
    return count;
  }, [assetClassFilter, ownerFilter, sourceFilter, searchQuery]);

  const assetClassButtons: { label: string; value: AssetClassFilter }[] = [
    { label: "All", value: "all" },
    { label: "Stocks", value: "STK" },
    { label: "Options", value: "OPT" },
    { label: "Crypto", value: "CRYPTO" },
    { label: "Cash", value: "CASH" },
  ];

  const ownerButtons: { label: string; value: OwnerFilter }[] = [
    { label: "All", value: "all" },
    { label: "TTC", value: "TTC" },
    { label: "Nick", value: "Nick" },
    { label: "Maisy", value: "Maisy" },
    { label: "Kids", value: "Kids" },
  ];

  const sourceButtons: { label: string; value: SourceFilter }[] = [
    { label: "All", value: "all" },
    { label: "IBKR", value: "IBKR" },
    { label: "HL", value: "HyperLiquid" },
    { label: "Coinbase", value: "CoinbasePrime" },
    { label: "Deribit", value: "Deribit" },
    { label: "Solana", value: "Solana" },
    { label: "Kraken", value: "Kraken" },
  ];

  return (
    <div className="space-y-3">
      {/* Filter Bar Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filters Toggle Button */}
        <Button
          variant={showFilters ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs font-semibold">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <div className="w-px h-6 bg-border" />

        {/* Asset Class Filter */}
        <FilterButtonGroup
          buttons={assetClassButtons}
          value={assetClassFilter}
          onChange={onAssetClassFilterChange}
        />

        <div className="w-px h-6 bg-border" />

        {/* Owner Filter */}
        <FilterButtonGroup
          buttons={ownerButtons}
          value={ownerFilter}
          onChange={onOwnerFilterChange}
        />

        <div className="w-px h-6 bg-border" />

        {/* Source Filter */}
        <FilterButtonGroup
          buttons={sourceButtons}
          value={sourceFilter}
          onChange={onSourceFilterChange}
        />

        {/* Counts */}
        <div className="ml-auto text-sm text-muted-foreground">
          {strategyCount} strategies, {positionCount} positions
        </div>
      </div>

      {/* Expanded Filter Panel */}
      {showFilters && (
        <div className="bg-card rounded-lg border p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search strategies and positions... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Clear Filters */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onAssetClassFilterChange("all");
                onOwnerFilterChange("all");
                onSourceFilterChange("all");
                onSearchQueryChange("");
                onAccountSelectionChange(accounts.map((a) => a.id));
              }}
            >
              Clear All Filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface FilterButtonGroupProps<T extends string> {
  buttons: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}

function FilterButtonGroup<T extends string>({
  buttons,
  value,
  onChange,
}: FilterButtonGroupProps<T>) {
  return (
    <div className="inline-flex rounded-md shadow-sm">
      {buttons.map((btn, index) => (
        <Button
          key={btn.value}
          variant={value === btn.value ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(btn.value)}
          className={cn(
            index === 0 && "rounded-r-none",
            index === buttons.length - 1 && "rounded-l-none",
            index > 0 && index < buttons.length - 1 && "rounded-none",
            index > 0 && "border-l-0"
          )}
        >
          {btn.label}
        </Button>
      ))}
    </div>
  );
}

// Helper to get owner from account (exported for use in other components)
export function getAccountOwner(account: Account): string {
  return account.owner ?? "Unknown";
}

// Helper to check if account matches owner filter
export function accountMatchesOwnerFilter(account: Account, filter: OwnerFilter): boolean {
  if (filter === "all") return true;
  if (filter === "Kids") return KIDS_OWNERS.includes(account.owner ?? "");
  return account.owner === filter;
}

// Helper to check if account matches source filter
export function accountMatchesSourceFilter(account: Account, filter: SourceFilter): boolean {
  if (filter === "all") return true;
  const brokerName = SOURCE_TO_BROKER[filter];
  return account.brokerName === brokerName;
}
