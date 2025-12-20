import { DashboardShell } from "@/components/layout/DashboardShell";
import { AccountSelector } from "@/components/layout/AccountSelector";
import { ExportCsvButton } from "@/components/blotter/ExportCsvButton";
import { BlotterFilters } from "@/components/blotter/BlotterFilters";
import { BlotterPageClient } from "./BlotterPageClient";
import { getPrimaryAccount, getAccounts } from "@/db/queries/accounts";
import { getBlotterEntries } from "@/db/queries/blotter";
import type { BlotterEntry } from "@/db/queries/blotter";

interface BlotterPageProps {
  searchParams?: Promise<{
    accountId?: string;
    source?: string | string[];
    actionClass?: string | string[];
    status?: string | string[];
    strategyKey?: string | string[];
    followUp?: string | string[];
    sort?: string;
    direction?: "asc" | "desc";
  }>;
}

export default async function BlotterPage({ searchParams }: BlotterPageProps) {
  const accounts = await getAccounts();
  const primaryAccount = await getPrimaryAccount();

  if (accounts.length === 0) {
    return (
      <DashboardShell
        activeNav="blotter"
        title="Blotter"
        subtitle="Create an account to start logging actions."
      >
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No accounts found. Head to <a href="/admin/accounts" className="text-blue-600 underline">Admin &gt; Accounts</a> to add one.
        </div>
      </DashboardShell>
    );
  }

  const params = await searchParams;
  
  // Get selected account from URL params, default to primary account
  const selectedAccountId = params?.accountId || primaryAccount?.id || null;
  const account = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId) || primaryAccount
    : primaryAccount;

  if (!account) {
    return (
      <DashboardShell
        activeNav="blotter"
        title="Blotter"
        subtitle="Create an account to start logging actions."
      >
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No accounts found. Head to <a href="/admin/accounts" className="text-blue-600 underline">Admin &gt; Accounts</a> to add one.
        </div>
      </DashboardShell>
    );
  }
  
  // Parse multi-select filters (can be string or string[])
  const sourceParam = params?.source;
  const sourceFilter = Array.isArray(sourceParam)
    ? sourceParam
    : sourceParam && sourceParam !== "all"
    ? [sourceParam]
    : [];
  
  const actionClassParam = params?.actionClass;
  const actionClassFilter = Array.isArray(actionClassParam)
    ? actionClassParam
    : actionClassParam && actionClassParam !== "all"
    ? [actionClassParam]
    : [];
  
  const statusParam = params?.status;
  const statusFilter = Array.isArray(statusParam)
    ? statusParam
    : statusParam && statusParam !== "all"
    ? [statusParam]
    : [];
  
  const strategyParam = params?.strategyKey;
  const strategyFilter = Array.isArray(strategyParam)
    ? strategyParam
    : strategyParam
    ? [strategyParam]
    : [];
  
  const followUpParam = params?.followUp;
  const followUpFilter = Array.isArray(followUpParam)
    ? followUpParam
    : followUpParam && followUpParam !== "all"
    ? [followUpParam]
    : [];

  const sortParam = params?.sort;
  const directionParam = params?.direction as "asc" | "desc" | undefined;

  // Get all records first to extract unique values for dropdowns
  const allEntries = await getBlotterEntries(account.id, {});

  // Extract unique values for filters
  const allSources = Array.from(new Set(allEntries.map(e => e.source).filter(Boolean))) as string[];
  const allActionClasses = Array.from(new Set(allEntries.map(e => e.actionClass).filter(Boolean))) as string[];
  const allStatuses = ["matched", "unmatched", "pending"];
  const allStrategies = Array.from(
    new Set(
      allEntries
        .map((e) => e.strategyKey)
        .filter((k): k is string => k !== null)
    )
  ).sort();
  const allFollowUps = ["pending", "completed", "none"];

  // Calculate counts for all options
  const sourceCounts: Record<string, number> = {};
  allSources.forEach((source) => {
    sourceCounts[source] = allEntries.filter((e) => e.source === source).length;
  });

  const actionClassCounts: Record<string, number> = {};
  allActionClasses.forEach((actionClass) => {
    actionClassCounts[actionClass] = allEntries.filter((e) => e.actionClass === actionClass).length;
  });

  const statusCounts: Record<string, number> = {};
  allStatuses.forEach((status) => {
    if (status === "matched") {
      statusCounts[status] = allEntries.filter((e) => 
        e.linkedBlotterActionId || (e.linkedTradeBlotterIds && e.linkedTradeBlotterIds.length > 0)
      ).length;
    } else if (status === "unmatched") {
      statusCounts[status] = allEntries.filter((e) => 
        e.source === 'trade_ingestion' && !e.linkedBlotterActionId && (!e.linkedTradeBlotterIds || e.linkedTradeBlotterIds.length === 0)
      ).length;
    } else if (status === "pending") {
      statusCounts[status] = allEntries.filter((e) => 
        e.followUpRequired && !e.completed
      ).length;
    }
  });

  const strategyCounts: Record<string, number> = {};
  allStrategies.forEach((strategy) => {
    strategyCounts[strategy] = allEntries.filter((e) => e.strategyKey === strategy).length;
  });

  const followUpCounts: Record<string, number> = {};
  allFollowUps.forEach((followUp) => {
    if (followUp === "pending") {
      followUpCounts[followUp] = allEntries.filter((e) => e.followUpRequired && !e.completed).length;
    } else if (followUp === "completed") {
      followUpCounts[followUp] = allEntries.filter((e) => e.completed).length;
    } else if (followUp === "none") {
      followUpCounts[followUp] = allEntries.filter((e) => !e.followUpRequired || e.followUpRequired === false).length;
    }
  });

  // Now get filtered records
  const entries = await getBlotterEntries(account.id, {
    source: sourceFilter.length > 0 ? sourceFilter : undefined,
    actionClass: actionClassFilter.length > 0 ? actionClassFilter : undefined,
    status: statusFilter.length > 0 ? statusFilter : undefined,
    strategyKey: strategyFilter.length > 0 ? strategyFilter : undefined,
    followUp: followUpFilter.length > 0 ? followUpFilter : undefined,
    sort: sortParam,
    direction: directionParam,
  });

  const pendingFollowUps = entries.filter(
    (entry) => entry.followUpRequired && !entry.completed
  );

  const unmatchedTrades = entries.filter(
    (e) => e.source === 'trade_ingestion' && !e.linkedBlotterActionId && (!e.linkedTradeBlotterIds || e.linkedTradeBlotterIds.length === 0)
  );

  return (
    <DashboardShell
      activeNav="blotter"
      title="Blotter"
      subtitle="Journal of decisions and follow-ups"
      actions={
        <ExportCsvButton
          rows={entries}
          columns={[
            { key: "actionDate", label: "action_date" },
            { key: "createdAt", label: "created_at" },
            { key: "strategyKey", label: "strategy_key" },
            { key: "actionClass", label: "action_class" },
            { key: "actionDetail", label: "action_detail" },
            { key: "reasonCode", label: "reason_code" },
            { key: "qtyChange", label: "qty_change" },
            { key: "premiumChange", label: "premium_change" },
            { key: "realizedPnl", label: "realized_pnl" },
            { key: "followUpRequired", label: "follow_up_required" },
            { key: "followUpDate", label: "follow_up_date" },
            { key: "completed", label: "completed" },
            { key: "source", label: "source" },
          ]}
          filename="blotter_export.csv"
        />
      }
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <SummaryCard label="Entries" value={entries.length.toString()} />
        <SummaryCard
          label="Pending follow-ups"
          value={pendingFollowUps.length.toString()}
          valueClass={pendingFollowUps.length > 0 ? "text-amber-600" : "text-slate-900"}
        />
        <SummaryCard
          label="Unmatched trades"
          value={unmatchedTrades.length.toString()}
          valueClass={
            unmatchedTrades.length > 0
              ? "text-amber-600"
              : "text-slate-900"
          }
        />
        <SummaryCard
          label="Matched"
          value={entries.filter((e) => 
            e.linkedBlotterActionId || (e.linkedTradeBlotterIds && e.linkedTradeBlotterIds.length > 0)
          ).length.toString()}
          valueClass="text-emerald-600"
        />
      </section>

      <div className="border-b bg-white px-6 py-4 -mx-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {accounts.length > 1 && (
            <AccountSelector
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              basePath="/blotter"
            />
          )}
        </div>
        <BlotterFilters
          sourceFilter={sourceFilter}
          actionClassFilter={actionClassFilter}
          statusFilter={statusFilter}
          strategyFilter={strategyFilter}
          followUpFilter={followUpFilter}
          allSources={allSources}
          allActionClasses={allActionClasses}
          allStatuses={allStatuses}
          allStrategies={allStrategies}
          allFollowUps={allFollowUps}
          sourceCounts={sourceCounts}
          actionClassCounts={actionClassCounts}
          statusCounts={statusCounts}
          strategyCounts={strategyCounts}
          followUpCounts={followUpCounts}
          totalEntries={entries.length}
        />
        </div>

      <BlotterPageClient 
        entries={entries} 
        sort={sortParam}
        direction={directionParam}
      />
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
      <p className={`mt-2 text-2xl font-semibold ${valueClass ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
