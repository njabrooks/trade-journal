import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { UnifiedStrategiesBrowser } from "@/components/strategies/UnifiedStrategiesBrowser";
import { getStrategiesForList } from "@/db/queries/strategies";
import { formatCurrency } from "@/lib/formatters";

interface StrategiesPageProps {
  searchParams?: Promise<{
    includeClosed?: string;
  }>;
}

export default async function StrategiesPage({ searchParams }: StrategiesPageProps) {
  const params = await searchParams;

  // Fetch only open strategies by default (reduces egress from ~1.5MB to ~300KB)
  // Users can add ?includeClosed=true to URL to see all strategies
  const includeClosed = params?.includeClosed === 'true';
  const allStrategies = await getStrategiesForList(200, { includeClosedStrategies: includeClosed });

  // Calculate totals for open strategies only
  const openStrategies = allStrategies.filter((s) => s.status === 'open');
  const totalAbs = openStrategies.reduce(
    (acc, strategy) => acc + (strategy.latestAbsNotional ?? 0),
    0
  );
  const totalPnl = openStrategies.reduce(
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
        <SummaryCard label="Open strategies" value={openStrategies.length.toString()} />
        <SummaryCard label="Abs notional" value={formatCurrency(totalAbs)} />
        <SummaryCard
          label="Unrealized PnL"
          value={formatCurrency(totalPnl)}
          valueClass={totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
      </section>

      {allStrategies.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500">
          No strategies yet. Confirm or create one to get started.
        </div>
      ) : (
        <UnifiedStrategiesBrowser strategies={allStrategies} />
      )}
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


