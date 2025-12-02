import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getStrategyDetail } from "@/db/queries/strategies";
import { formatCurrency, formatDateLabel } from "@/lib/formatters";

interface BlotterPageProps {
  params: Promise<{ strategyId: string }>;
}

export default async function BlotterPage({ params }: BlotterPageProps) {
  const { strategyId } = await params;
  const detail = await getStrategyDetail(strategyId);

  if (!detail) {
    notFound();
  }

  const { strategy } = detail;

  return (
    <DashboardShell
      activeNav="strategies"
      title={strategy.label ?? strategy.strategyKey}
      subtitle={`${strategy.strategyKey} · ${strategy.accountLabel ?? strategy.accountBrokerId ?? "Unassigned"}`}
    >
      <section className="grid gap-6 lg:grid-cols-2">
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
      </section>
    </DashboardShell>
  );
}

