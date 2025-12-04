import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StrategyTabs } from "@/components/layout/StrategyTabs";
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
      tabs={<StrategyTabs strategyId={strategyId} />}
    >
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
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
      </section>
    </DashboardShell>
  );
}

