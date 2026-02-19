"use client";

import { PieChart } from "@/components/charts/PieChart";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { TrendingUp, TrendingDown } from "lucide-react";
import type {
  OwnerBreakdownItem,
  AssetClassBreakdownItem,
  AccountingSummary,
} from "@/db/queries/accounting";

// Owner colors — consistent with PortfolioCharts
const OWNER_COLORS: Record<string, string> = {
  TTC: "oklch(0.63 0.2 250)",
  Nick: "oklch(0.7 0.24 30)",
  Maisy: "oklch(0.7 0.18 150)",
  Kids: "oklch(0.68 0.2 280)",
  Alex: "oklch(0.65 0.22 310)",
  Lily: "oklch(0.75 0.2 340)",
  Leo: "oklch(0.7 0.2 60)",
  Unknown: "oklch(0.6 0.1 240)",
};

const KIDS_OWNERS = new Set(["Alex", "Lily", "Leo"]);

// Asset class display colors
const ASSET_CLASS_COLORS: Record<string, string> = {
  STK: "oklch(0.63 0.2 250)",
  OPT: "oklch(0.7 0.24 30)",
  CRYPTO: "oklch(0.7 0.18 150)",
  CASH: "oklch(0.75 0.1 90)",
  BOND: "oklch(0.68 0.2 280)",
  FUT: "oklch(0.65 0.22 310)",
  Unknown: "oklch(0.6 0.1 240)",
};

const ASSET_CLASS_LABELS: Record<string, string> = {
  STK: "Equities",
  OPT: "Options",
  CRYPTO: "Crypto",
  CASH: "Cash",
  BOND: "Bonds",
  FUT: "Futures",
};

function groupKidsOwners(owners: OwnerBreakdownItem[]): OwnerBreakdownItem[] {
  const grouped: OwnerBreakdownItem[] = [];
  let kidsTotal = 0;

  for (const owner of owners) {
    if (KIDS_OWNERS.has(owner.owner)) {
      kidsTotal += owner.marketValue;
    } else {
      grouped.push(owner);
    }
  }

  if (kidsTotal > 0) {
    grouped.push({ owner: "Kids", marketValue: kidsTotal });
  }

  return grouped.sort((a, b) => b.marketValue - a.marketValue);
}

interface AccountingBreakdownsProps {
  ownerBreakdown: OwnerBreakdownItem[];
  assetClassBreakdown: AssetClassBreakdownItem[];
  summary: AccountingSummary;
  realizedPnl: number;
}

export function AccountingBreakdowns({
  ownerBreakdown,
  assetClassBreakdown,
  summary,
  realizedPnl,
}: AccountingBreakdownsProps) {
  const groupedOwners = groupKidsOwners(ownerBreakdown);
  const totalOwnerMv = groupedOwners.reduce((s, o) => s + o.marketValue, 0);

  const ownerSegments = groupedOwners.map((o) => ({
    label: o.owner,
    value: o.marketValue,
    color: OWNER_COLORS[o.owner] ?? OWNER_COLORS.Unknown,
  }));

  const totalClassMv = assetClassBreakdown.reduce(
    (s, c) => s + c.marketValue,
    0
  );
  const classSegments = assetClassBreakdown
    .sort((a, b) => b.marketValue - a.marketValue)
    .map((c) => ({
      label: ASSET_CLASS_LABELS[c.assetClass] ?? c.assetClass,
      value: c.marketValue,
      color: ASSET_CLASS_COLORS[c.assetClass] ?? ASSET_CLASS_COLORS.Unknown,
    }));

  const unrealizedPositive = summary.unrealizedGain >= 0;

  return (
    <section className="grid gap-4 grid-cols-1 lg:grid-cols-3">
      {/* Owner Breakdown */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground">
          Owner Breakdown
        </p>
        <div className="mt-3 flex justify-center">
          <PieChart segments={ownerSegments} size={100} />
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          {groupedOwners.map((owner) => {
            const pct =
              totalOwnerMv > 0 ? (owner.marketValue / totalOwnerMv) * 100 : 0;
            const color = OWNER_COLORS[owner.owner] ?? OWNER_COLORS.Unknown;
            return (
              <div
                key={owner.owner}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-muted-foreground">{owner.owner}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {formatPercent(pct)}
                  </span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(owner.marketValue)}
                  </span>
                </div>
              </div>
            );
          })}
        </dl>
      </div>

      {/* Asset Class Breakdown */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground">
          Asset Class Breakdown
        </p>
        <div className="mt-3 flex justify-center">
          <PieChart segments={classSegments} size={100} />
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          {assetClassBreakdown
            .sort((a, b) => b.marketValue - a.marketValue)
            .map((cls) => {
              const pct =
                totalClassMv > 0
                  ? (cls.marketValue / totalClassMv) * 100
                  : 0;
              const color =
                ASSET_CLASS_COLORS[cls.assetClass] ??
                ASSET_CLASS_COLORS.Unknown;
              const label =
                ASSET_CLASS_LABELS[cls.assetClass] ?? cls.assetClass;
              return (
                <div
                  key={cls.assetClass}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {formatPercent(pct)}
                    </span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(cls.marketValue)}
                    </span>
                  </div>
                </div>
              );
            })}
        </dl>
      </div>

      {/* P&L Summary */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground">P&L Summary</p>
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-center gap-1.5">
              {unrealizedPositive ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              )}
              <span className="text-xs text-muted-foreground">
                Unrealized P&L
              </span>
            </div>
            <p
              className={`mt-1 text-xl font-semibold ${
                unrealizedPositive ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {formatCurrency(summary.unrealizedGain)}
            </p>
            <p
              className={`text-xs ${
                unrealizedPositive ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {formatPercent(summary.unrealizedGainPercent)}
            </p>
          </div>

          <div>
            <span className="text-xs text-muted-foreground">
              Realized P&L
            </span>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatCurrency(realizedPnl)}
            </p>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Price Coverage</span>
              <span className="font-medium text-foreground">
                {formatPercent(summary.priceCompleteness)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-emerald-500"
                style={{
                  width: `${Math.min(100, summary.priceCompleteness)}%`,
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs border-t pt-3">
            <span className="text-muted-foreground">Positions</span>
            <span className="font-medium text-foreground">
              {summary.positionCount.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
