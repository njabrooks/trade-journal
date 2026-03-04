"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { TaxTransactionsTable } from "@/components/accounting/TaxTransactionsTable";
import { TaxTransactionsSummary } from "@/components/accounting/TaxTransactionsSummary";
import { TaxTransactionsFilters } from "@/components/accounting/TaxTransactionsFilters";
import { getTaxYears } from "@/db/queries/tax-transactions";
import type {
  TaxTransactionsResult,
  TaxYearConfig,
} from "@/db/queries/tax-transactions";

type Currency = "USD" | "GBP";

// Default to TTC owner and latest tax year
const DEFAULT_OWNER = "TTC";

export default function TaxTransactionsPage() {
  const [currency, setCurrency] = useState<Currency>("GBP");
  const [owner, setOwner] = useState(DEFAULT_OWNER);
  const [taxYears, setTaxYears] = useState<TaxYearConfig[]>([]);
  const [taxYear, setTaxYear] = useState("");
  const [eventType, setEventType] = useState("all");
  const [matchType, setMatchType] = useState("all");
  const [assetTicker, setAssetTicker] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TaxTransactionsResult | null>(null);
  const [tickers, setTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Compute tax years when owner changes
  useEffect(() => {
    const years = getTaxYears(owner);
    setTaxYears(years);
    // Default to the latest full year (second from last)
    const defaultYear = years.length >= 2 ? years[years.length - 2].label : years[years.length - 1]?.label ?? "";
    setTaxYear(defaultYear);
  }, [owner]);

  // Fetch tickers for filter
  useEffect(() => {
    fetch(`/api/dashboard/accounting/transactions/tickers?owner=${owner}`)
      .then((r) => r.json())
      .then(setTickers)
      .catch(console.error);
  }, [owner]);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!taxYear || taxYears.length === 0) return;
    setLoading(true);

    const yearConfig = taxYears.find((y) => y.label === taxYear);
    if (!yearConfig) return;

    const params = new URLSearchParams({
      owner,
      taxYearStart: yearConfig.startDate,
      taxYearEnd: yearConfig.endDate,
      page: String(page),
      pageSize: "50",
    });
    if (eventType !== "all") params.set("eventType", eventType);
    if (matchType !== "all") params.set("matchType", matchType);
    if (assetTicker) params.set("asset", assetTicker);

    try {
      const res = await fetch(`/api/dashboard/accounting/transactions?${params}`);
      const result: TaxTransactionsResult = await res.json();
      setData(result);
    } catch (err) {
      console.error("Failed to fetch tax transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [owner, taxYear, taxYears, eventType, matchType, assetTicker, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [owner, taxYear, eventType, matchType, assetTicker]);

  function handleExport() {
    if (!taxYear || taxYears.length === 0) return;
    const yearConfig = taxYears.find((y) => y.label === taxYear);
    if (!yearConfig) return;

    const params = new URLSearchParams({
      owner,
      taxYearStart: yearConfig.startDate,
      taxYearEnd: yearConfig.endDate,
    });
    if (eventType !== "all") params.set("eventType", eventType);
    if (matchType !== "all") params.set("matchType", matchType);
    if (assetTicker) params.set("asset", assetTicker);

    window.open(`/api/dashboard/accounting/transactions/export?${params}`, "_blank");
  }

  return (
    <DashboardShell
      title="Tax Transactions"
      subtitle={`${owner} — ${taxYear}`}
      activeNav="accounting-transactions"
      actions={
        <div className="flex items-center gap-2">
          {(["USD", "GBP"] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                currency === c
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground border"
              }`}
            >
              {c === "USD" ? "$ USD" : "\u00a3 GBP"}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-4">
        <TaxTransactionsFilters
          owner={owner}
          taxYear={taxYear}
          taxYears={taxYears}
          eventType={eventType}
          matchType={matchType}
          assetTicker={assetTicker}
          tickers={tickers}
          onOwnerChange={setOwner}
          onTaxYearChange={setTaxYear}
          onEventTypeChange={setEventType}
          onMatchTypeChange={setMatchType}
          onAssetTickerChange={setAssetTicker}
          onExport={handleExport}
        />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : data ? (
          <>
            <TaxTransactionsSummary summary={data.summary} currency={currency} />
            <TaxTransactionsTable
              rows={data.rows}
              currency={currency}
              totalCount={data.totalCount}
              page={data.page}
              pageSize={data.pageSize}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
