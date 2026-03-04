"use client";

import { formatCurrency } from "@/lib/formatters";
import type { TaxTransactionsSummary as SummaryType } from "@/db/queries/tax-transactions";

interface TaxTransactionsSummaryProps {
  summary: SummaryType;
  currency: string;
}

export function TaxTransactionsSummary({ summary, currency }: TaxTransactionsSummaryProps) {
  const isGbp = currency === "GBP";

  const cards = [
    {
      label: "Total Proceeds",
      value: isGbp ? summary.totalProceedsGbp : summary.totalProceedsUsd,
    },
    {
      label: "ACB Gain/Loss",
      value: isGbp ? summary.totalAcbGainGbp : summary.totalAcbGainUsd,
      colored: true,
    },
    ...(isGbp
      ? [{ label: "S104 Gain/Loss", value: summary.totalS104GainGbp, colored: true }]
      : []),
    { label: "Disposals", value: summary.disposalCount, raw: true },
    { label: "Total Events", value: summary.totalCount, raw: true },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-5">
      {cards.map((card) => {
        const pnlColor =
          card.colored && card.value !== 0
            ? card.value > 0
              ? "text-emerald-600"
              : "text-red-500"
            : "";

        return (
          <div key={card.label} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">{card.label}</div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${pnlColor}`}>
              {card.raw
                ? card.value.toLocaleString()
                : formatCurrency(card.value, currency)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
