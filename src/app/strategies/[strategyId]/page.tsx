import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Sparkline } from "@/components/charts/Sparkline";
import { getStrategyDetail } from "@/db/queries/strategies";
import {
  formatCurrency,
  formatDateLabel,
  formatPercent,
} from "@/lib/formatters";

interface StrategyDetailPageProps {
  params: Promise<{ strategyId: string }>;
}

export default async function StrategyDetailPage({ params }: StrategyDetailPageProps) {
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
      actions={
        <div className="flex gap-2">
          <Link
            href="/triage"
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
          >
            Triage Queue
          </Link>
          <Link
            href="/blotter"
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
          >
            Blotter
          </Link>
        </div>
      }
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

        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Playbook</p>
            <dl className="mt-3 space-y-3 text-sm text-slate-600">
              <InfoRow label="Strategy Type" value={strategy.strategyType ?? "—"} />
              <InfoRow label="State Code" value={detail.currentStateCode ?? "—"} />
              <InfoRow label="Template" value={strategy.templateLabel ?? "—"} />
              <InfoRow label="Underlying" value={strategy.underlyingTicker ?? "—"} />
              <InfoRow label="Opened" value={strategy.openedAt ? new Date(strategy.openedAt).toLocaleDateString() : "—"} />
              <InfoRow label="Status" value={strategy.status} />
            </dl>
          </div>

          {detail.currentPlaybookItem && (
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">Current State: {detail.currentPlaybookItem.code}</p>
                  <p className="text-lg font-semibold text-slate-900 mt-1">{detail.currentPlaybookItem.label}</p>
                </div>
                <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800">
                  {detail.currentPlaybookItem.category}
                </span>
              </div>
              {detail.currentPlaybookItem.description && (
                <p className="text-sm text-slate-600 mb-4">{detail.currentPlaybookItem.description}</p>
              )}
              {detail.currentPlaybookItem.checklistItems && detail.currentPlaybookItem.checklistItems.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</p>
                  {detail.currentPlaybookItem.checklistItems.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 mt-0.5">
                        {item.type}
                      </span>
                      <p className="text-sm text-slate-700 flex-1">{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(strategy.thesis || strategy.profitRules || strategy.defenseRules) && (
            <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
              {strategy.thesis && (
                <RuleBlock title="Thesis" body={strategy.thesis} />
              )}
              {strategy.profitRules && (
                <RuleBlock title="Profit Rules" body={strategy.profitRules} />
              )}
              {strategy.defenseRules && (
                <RuleBlock title="Defense Rules" body={strategy.defenseRules} />
              )}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
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

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Triage Flags</p>
              <p className="text-xs text-slate-400">
                {detail.triageFlags.length} latest alerts
              </p>
            </div>
            <Link href="/triage" className="text-xs text-blue-600">
              View queue
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {detail.triageFlags.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                No recent triage flags.
              </p>
            ) : (
              detail.triageFlags.map((flag) => (
                <div
                  key={flag.id}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between text-xs">
                    <SeverityPill severity={flag.severity} />
                    <span className="text-slate-400">{formatDateLabel(flag.snapshotDate)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {flag.symbol} · {flag.recommendedAction || "Review"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatPercent(flag.pctNavAbsNotional ?? null)} NAV · {flag.dte ?? "—"} DTE
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Recent Trades</p>
            <span className="text-xs text-slate-400">{detail.recentTrades.length} fills</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Side</th>
                  <th className="py-2 pr-4">Qty</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">Symbol</th>
                  <th className="py-2">Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {detail.recentTrades.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      No trades linked to this strategy.
                    </td>
                  </tr>
                ) : (
                  detail.recentTrades.map((trade) => (
                    <tr key={trade.id}>
                      <td className="py-2 pr-4 text-xs text-slate-500">
                        {trade.tradeDate ? new Date(trade.tradeDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2 pr-4 font-medium">{trade.side}</td>
                      <td className="py-2 pr-4">{trade.quantity}</td>
                      <td className="py-2 pr-4">{trade.price.toFixed(2)}</td>
                      <td className="py-2 pr-4">{trade.symbol}</td>
                      <td className="py-2">{formatCurrency(trade.grossAmount ?? null)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Blotter</p>
            <Link href="/blotter" className="text-xs text-blue-600">
              Full log
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {detail.blotter.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                No blotter entries yet.
              </p>
            ) : (
              detail.blotter.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{formatDateLabel(entry.actionDate)}</span>
                    <span>{entry.reasonCode || entry.actionClass || "Action"}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {entry.actionDetail || "Manual update"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Premium {formatCurrency(entry.premiumChange ?? null)} · Realized{" "}
                    {formatCurrency(entry.realizedPnl ?? null)}
                  </p>
                </div>
              ))
            )}
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function RuleBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{body}</p>
    </div>
  );
}

function SeverityPill({ severity }: { severity: string | null }) {
  if (!severity) {
    return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px]">Info</span>;
  }
  const palette: Record<string, string> = {
    urgent: "bg-rose-100 text-rose-700",
    attention: "bg-amber-100 text-amber-700",
    watch: "bg-blue-100 text-blue-700",
    info: "bg-slate-200 text-slate-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        palette[severity] ?? "bg-slate-200 text-slate-700"
      }`}
    >
      {severity}
    </span>
  );
}

