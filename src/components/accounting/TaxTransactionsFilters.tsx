"use client";

import { useEffect, useState } from "react";
import { Download, Filter, X } from "lucide-react";
import type { TaxYearConfig } from "@/lib/tax-years";

interface TaxTransactionsFiltersProps {
  owner: string;
  taxYear: string; // label like "2023/24"
  taxYears: TaxYearConfig[];
  eventType: string;
  matchType: string;
  assetTicker: string;
  tickers: string[];
  onOwnerChange: (v: string) => void;
  onTaxYearChange: (v: string) => void;
  onEventTypeChange: (v: string) => void;
  onMatchTypeChange: (v: string) => void;
  onAssetTickerChange: (v: string) => void;
  onExport: () => void;
}

const OWNERS = ["TTC", "Nick", "Nick ISA", "Maisy", "Tiff", "Tiff ISA"];
const EVENT_TYPES = [
  { value: "all", label: "All Events" },
  { value: "disposal", label: "Disposals" },
  { value: "acquisition", label: "Acquisitions" },
];
const MATCH_TYPES = [
  { value: "all", label: "All Matches" },
  { value: "same_day", label: "Same Day" },
  { value: "bed_and_breakfast", label: "B&B" },
  { value: "section_104_pool", label: "S104 Pool" },
];

export function TaxTransactionsFilters({
  owner,
  taxYear,
  taxYears,
  eventType,
  matchType,
  assetTicker,
  tickers,
  onOwnerChange,
  onTaxYearChange,
  onEventTypeChange,
  onMatchTypeChange,
  onAssetTickerChange,
  onExport,
}: TaxTransactionsFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [tickerSearch, setTickerSearch] = useState(assetTicker);

  useEffect(() => {
    setTickerSearch(assetTicker);
  }, [assetTicker]);

  const hasActiveFilters = eventType !== "all" || matchType !== "all" || assetTicker !== "";

  return (
    <div className="space-y-3">
      {/* Primary filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Owner */}
        <select
          value={owner}
          onChange={(e) => onOwnerChange(e.target.value)}
          className="rounded-md border bg-card px-3 py-1.5 text-sm"
        >
          {OWNERS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        {/* Tax Year */}
        <select
          value={taxYear}
          onChange={(e) => onTaxYearChange(e.target.value)}
          className="rounded-md border bg-card px-3 py-1.5 text-sm"
        >
          {taxYears.map((ty) => (
            <option key={ty.label} value={ty.label}>{ty.label}</option>
          ))}
        </select>

        {/* Toggle filters */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
            hasActiveFilters
              ? "border-foreground/30 bg-foreground/5 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] text-background">
              {[eventType !== "all", matchType !== "all", assetTicker !== ""].filter(Boolean).length}
            </span>
          )}
        </button>

        {/* Export */}
        <button
          onClick={onExport}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors ml-auto"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* Extended filters */}
      {showFilters && (
        <div className="rounded-lg border bg-card p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Event Type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Event Type
              </label>
              <select
                value={eventType}
                onChange={(e) => onEventTypeChange(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                {EVENT_TYPES.map((et) => (
                  <option key={et.value} value={et.value}>{et.label}</option>
                ))}
              </select>
            </div>

            {/* Match Type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                S104 Match Type
              </label>
              <select
                value={matchType}
                onChange={(e) => onMatchTypeChange(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                {MATCH_TYPES.map((mt) => (
                  <option key={mt.value} value={mt.value}>{mt.label}</option>
                ))}
              </select>
            </div>

            {/* Asset Ticker */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Asset
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={tickerSearch}
                  onChange={(e) => {
                    setTickerSearch(e.target.value.toUpperCase());
                    onAssetTickerChange(e.target.value.toUpperCase());
                  }}
                  placeholder="Search ticker..."
                  list="ticker-list"
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                />
                <datalist id="ticker-list">
                  {tickers.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                {tickerSearch && (
                  <button
                    onClick={() => { setTickerSearch(""); onAssetTickerChange(""); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => {
                onEventTypeChange("all");
                onMatchTypeChange("all");
                onAssetTickerChange("");
                setTickerSearch("");
              }}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
