import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getStrategiesForList } from "@/db/queries/strategies";
import { formatCurrency, formatPercent } from "@/lib/formatters";

export default async function StrategiesPage() {
  const strategies = await getStrategiesForList();

  // Strategies are already filtered to open only, so use directly
  const totalAbs = strategies.reduce(
    (acc, strategy) => acc + (strategy.latestAbsNotional ?? 0),
    0
  );
  const totalPnl = strategies.reduce(
    (acc, strategy) => acc + (strategy.latestUnrealized ?? 0),
    0
  );

  return (
    <DashboardShell
      activeNav="strategies"
      title="Strategies"
      subtitle="Confirmed strategies with live metrics"
      actions={
        <Link
          href="/admin/strategies"
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
        >
          Manage Strategies
        </Link>
      }
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard label="Open strategies" value={strategies.length.toString()} />
        <SummaryCard label="Abs notional" value={formatCurrency(totalAbs)} />
        <SummaryCard
          label="Unrealized PnL"
          value={formatCurrency(totalPnl)}
          valueClass={totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
      </section>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Strategy List</p>
            <p className="text-xs text-slate-400">
              Showing {strategies.length} most recent
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3">Strategy</th>
                <th className="px-6 py-3">Account</th>
                <th className="px-6 py-3">State Code</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Abs Notional</th>
                <th className="px-6 py-3 text-right">Unrealized</th>
                <th className="px-6 py-3 text-right">% NAV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {strategies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    No strategies yet. Confirm or create one to get started.
                  </td>
                </tr>
              ) : (
                strategies.map((strategy) => (
                  <tr key={strategy.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <Link
                          href={`/strategies/${strategy.id}`}
                          className="font-medium text-slate-900 hover:text-blue-600"
                        >
                          {strategy.label}
                        </Link>
                        <span className="text-xs text-slate-400">{strategy.strategyKey}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {strategy.accountLabel || strategy.accountBrokerId || "—"}
                    </td>
                    <td className="px-6 py-3">
                      {strategy.stateCode ? (
                        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800">
                          {strategy.stateCode}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={strategy.status} />
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-slate-900">
                      {formatCurrency(strategy.latestAbsNotional)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span
                        className={
                          strategy.latestUnrealized && strategy.latestUnrealized >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }
                      >
                        {formatCurrency(strategy.latestUnrealized)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {formatPercent(strategy.latestPctNav)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}

function SummaryCard({
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

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const palette: Record<string, string> = {
    open: "bg-emerald-100 text-emerald-700",
    closed: "bg-slate-200 text-slate-700",
    draft: "bg-amber-100 text-amber-700",
    planned: "bg-blue-100 text-blue-700",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${palette[normalized] ?? "bg-slate-200 text-slate-700"}`}
    >
      {status}
    </span>
  );
}

