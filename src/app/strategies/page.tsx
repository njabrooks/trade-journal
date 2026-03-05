import { Metadata } from "next";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { UnifiedStrategiesBrowser } from "@/components/strategies/UnifiedStrategiesBrowser";
import { getStrategiesForList } from "@/db/queries/strategies";
import { formatCurrency } from "@/lib/formatters";

export const metadata: Metadata = {
  title: "Strategies",
};

export default async function StrategiesPage() {
  // Fetch all strategies — client-side quick filters handle status filtering
  const allStrategies = await getStrategiesForList(200, { includeClosedStrategies: true });

  // Calculate totals for active strategies only
  const openStrategies = allStrategies.filter((s) => s.status === 'active');
  const totalMV = openStrategies.reduce(
    (acc, strategy) => acc + (strategy.latestMarketValue ?? 0),
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
          className="rounded-full border border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:border-border hover:text-foreground"
        >
          Manage Strategies
        </Link>
      }
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard label="Open strategies" value={openStrategies.length.toString()} />
        <SummaryCard label="Market value" value={formatCurrency(totalMV)} />
        <SummaryCard
          label="Unrealized PnL"
          value={formatCurrency(totalPnl)}
          valueClass={totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
      </section>

      {allStrategies.length === 0 ? (
        <div className="bg-card rounded-lg border border p-12 text-center text-muted-foreground">
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
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass ?? "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}


