import { Metadata } from "next";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Sparkline } from "@/components/charts/Sparkline";
import { StackedBar } from "@/components/charts/StackedBar";
import { getPrimaryAccount } from "@/db/queries/accounts";
import { getPortfolioDashboardData } from "@/db/queries/portfolio";
import {
  formatCurrency,
  formatDateLabel,
  formatPercent,
} from "@/lib/formatters";

export const metadata: Metadata = {
  title: "Portfolio",
};

export default async function PortfolioDashboardPage() {
  const account = await getPrimaryAccount();

  if (!account) {
    return (
      <DashboardShell
        activeNav="portfolio"
        title="Portfolio Overview"
        subtitle="Create an account to see aggregated exposure."
      >
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No accounts found. Head to <a href="/admin/accounts" className="text-blue-600 underline">Admin &gt; Accounts</a> to add one.
        </div>
      </DashboardShell>
    );
  }

  const dashboardData = await getPortfolioDashboardData(account.id);

  const latestNav = dashboardData.navTrend.at(-1)?.nav ?? null;
  const latestSnapshot = dashboardData.latestAccountSnapshot;
  const latestStockNotional = Math.abs(latestSnapshot?.absStockNotional ?? 0);
  const latestOptionNotional = Math.abs(latestSnapshot?.absOptionNotional ?? 0);

  const navSparklineData = dashboardData.navTrend.map((point) => ({
    label: formatDateLabel(point.date),
    value: point.nav,
  }));

  const notionalSparklineData = dashboardData.accountSnapshots.map((point) => ({
    label: formatDateLabel(point.date),
    value: point.totalAbsNotional,
  }));

  const snapshotRows = dashboardData.accountSnapshots.slice(-8).reverse();

  return (
    <DashboardShell
      activeNav="portfolio"
      title="Portfolio Overview"
      subtitle={account.label || account.brokerAccountId}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="NAV" value={formatCurrency(latestNav)} delta={navSparklineData.at(-1)?.label} />
        <MetricCard
          label="Total Abs Notional"
          value={formatCurrency(latestSnapshot?.totalAbsNotional ?? null)}
          delta={formatPercent(latestSnapshot?.pctNavAbsNotional ?? null)}
        />
        <MetricCard
          label="Unrealized PnL"
          value={formatCurrency(latestSnapshot?.totalUnrealizedPnl ?? null)}
          valueClass={(latestSnapshot?.totalUnrealizedPnl ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">NAV Trend</p>
              <p className="text-2xl font-semibold text-slate-900">
                {formatCurrency(latestNav)}
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {navSparklineData.length} days
            </span>
          </div>
          <div className="mt-4 h-32">
            <Sparkline data={navSparklineData} stroke="#2563eb" showHighLow />
          </div>
          <div className="mt-8 flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Abs Notional Trend</p>
              <p className="text-lg font-semibold text-slate-900">
                {formatCurrency(latestSnapshot?.totalAbsNotional ?? null)}
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {notionalSparklineData.length} days
            </span>
          </div>
          <div className="mt-4 h-28">
            <Sparkline data={notionalSparklineData} stroke="#16a34a" showHighLow />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Exposure Mix</p>
            <div className="mt-4">
              <StackedBar
                segments={[
                  { label: "Stock", value: latestStockNotional, color: "oklch(0.63 0.2 250)" },
                  { label: "Options", value: latestOptionNotional, color: "oklch(0.7 0.24 30)" },
                ]}
              />
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[oklch(0.63_0.2_250)]" />
                  <span>Stock</span>
                </div>
                <span className="font-medium">{formatCurrency(latestStockNotional)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[oklch(0.7_0.24_30)]" />
                  <span>Options</span>
                </div>
                <span className="font-medium">{formatCurrency(latestOptionNotional)}</span>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Leverage vs NAV</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatPercent(latestSnapshot?.pctNavAbsNotional ?? null, 1)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Abs notional as % of NAV
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Top Underlyings</p>
              <p className="text-xs text-slate-400">
                Latest snapshot {formatDateLabel(latestSnapshot?.date ?? null)}
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {dashboardData.underlyingBreakdown.length} rows
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4">Ticker</th>
                  <th className="py-2 pr-4">Abs Notional</th>
                  <th className="py-2 pr-4">Unrealized</th>
                  <th className="py-2">Pct NAV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {dashboardData.underlyingBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      No underlying level snapshots captured for the latest date.
                    </td>
                  </tr>
                ) : (
                  dashboardData.underlyingBreakdown.map((row) => (
                    <tr key={row.underlyingId}>
                      <td className="py-2 pr-4 font-medium text-slate-900">
                        {row.ticker || row.underlyingId.slice(0, 6)}
                      </td>
                      <td className="py-2 pr-4">{formatCurrency(row.totalAbsNotional ?? null)}</td>
                      <td
                        className="py-2 pr-4"
                      >
                        <span
                          className={row.totalUnrealizedPnl && row.totalUnrealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"}
                        >
                          {formatCurrency(row.totalUnrealizedPnl ?? null)}
                        </span>
                      </td>
                      <td className="py-2">
                        {formatPercent(row.pctNavAbsNotional ?? null)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Recent Snapshots</p>
            <span className="text-xs text-slate-400">Last {snapshotRows.length} days</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Abs Notional</th>
                  <th className="py-2 pr-4">PnL</th>
                  <th className="py-2">Pct NAV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {snapshotRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      No portfolio snapshots captured yet.
                    </td>
                  </tr>
                ) : (
                  snapshotRows.map((row) => (
                    <tr key={row.date}>
                      <td className="py-2 pr-4">{formatDateLabel(row.date)}</td>
                      <td className="py-2 pr-4">{formatCurrency(row.totalAbsNotional ?? null)}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={row.totalUnrealizedPnl && row.totalUnrealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"}
                        >
                          {formatCurrency(row.totalUnrealizedPnl ?? null)}
                        </span>
                      </td>
                      <td className="py-2">{formatPercent(row.pctNavAbsNotional ?? null)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  valueClass?: string;
}

function MetricCard({ label, value, delta, valueClass }: MetricCardProps) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass ?? "text-slate-900"}`}>{value}</p>
      {delta ? <p className="mt-1 text-xs text-slate-400">{delta}</p> : null}
    </div>
  );
}

