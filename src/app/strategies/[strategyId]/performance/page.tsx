import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Sparkline } from "@/components/charts/Sparkline";
import { getStrategyDetail } from "@/db/queries/strategies";
import {
  formatCurrency,
  formatDateLabel,
  formatPercent,
} from "@/lib/formatters";

interface PerformancePageProps {
  params: Promise<{ strategyId: string }>;
}

export default async function PerformancePage({ params }: PerformancePageProps) {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);

  if (!detail) {
    notFound();
  }

  const { strategy } = detail;
  const latestMetrics = detail.metricsTimeline.at(-1);
  const openPositionCount =
    latestMetrics?.numOpenPositions ?? detail.openPositions.length ?? 0;

  const pnlSparkline = detail.metricsTimeline.map((point) => ({
    label: formatDateLabel(point.snapshotDate),
    value: point.totalUnrealizedPnl,
  }));

  const notionalSparkline = detail.metricsTimeline.map((point) => ({
    label: formatDateLabel(point.snapshotDate),
    value: point.totalAbsNotional,
  }));

  return (
    <DashboardShell
      activeNav="strategies"
      title={strategy.label ?? strategy.strategyKey}
      subtitle={`${strategy.strategyKey} · ${strategy.accountLabel ?? strategy.accountBrokerId ?? "Unassigned"}`}
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Abs Notional" value={formatCurrency(latestMetrics?.totalAbsNotional ?? null)} />
        <Metric
          label="Unrealized PnL"
          value={formatCurrency(latestMetrics?.totalUnrealizedPnl ?? null)}
          valueClass={
            latestMetrics && (latestMetrics.totalUnrealizedPnl ?? 0) >= 0
              ? "text-emerald-600"
              : "text-rose-600"
          }
        />
        <Metric
          label="Pct NAV"
          value={formatPercent(latestMetrics?.pctNavAbsNotional ?? null)}
        />
        <Metric label="Open Positions" value={openPositionCount.toString()} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">PnL Timeline</p>
              <p className="text-2xl font-semibold text-slate-900">
                {formatCurrency(latestMetrics?.totalUnrealizedPnl ?? null)}
              </p>
            </div>
            <span className="text-xs text-slate-400">{pnlSparkline.length} pts</span>
          </div>
          <div className="mt-4 h-32">
            <Sparkline data={pnlSparkline} stroke="#0ea5e9" />
          </div>
          <div className="mt-6 border-t pt-4">
            <p className="text-sm font-medium text-slate-500">Abs Notional</p>
            <div className="mt-2 h-32">
              <Sparkline data={notionalSparkline} stroke="#2563eb" />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Open Positions</p>
              <p className="text-xs text-slate-400">{detail.openPositions.length} legs</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4">Symbol</th>
                  <th className="py-2 pr-4">Qty</th>
                  <th className="py-2 pr-4">Abs Notional</th>
                  <th className="py-2">PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {detail.openPositions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      No open positions assigned to this strategy.
                    </td>
                  </tr>
                ) : (
                  detail.openPositions.map((position) => (
                    <tr key={position.id}>
                      <td className="py-2 pr-4 font-medium text-slate-900">
                        {position.symbol}
                        {position.expiry ? ` · ${position.expiry}` : ""}
                      </td>
                      <td className="py-2 pr-4">{position.quantity}</td>
                      <td className="py-2 pr-4">
                        {formatCurrency(position.absNotional ?? null)}
                      </td>
                      <td className="py-2">
                        <span
                          className={
                            position.unrealizedPnl && position.unrealizedPnl >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }
                        >
                          {formatCurrency(position.unrealizedPnl ?? null)}
                        </span>
                      </td>
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

function Metric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass ?? "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

