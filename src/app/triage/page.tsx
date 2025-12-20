import { DashboardShell } from "@/components/layout/DashboardShell";
import { AccountSelector } from "@/components/layout/AccountSelector";
import { TriageFilters } from "@/components/triage/TriageFilters";
import { TriageTableRow } from "@/components/triage/TriageTableRow";
import { TriageBulkActions } from "@/components/triage/TriageBulkActions";
import { SortableHeader } from "@/components/triage/SortableHeader";
import { getPrimaryAccount, getAccounts } from "@/db/queries/accounts";
import { getTriageQueue } from "@/db/queries/triage";
import { formatDateFull } from "@/lib/formatters";
import { ALL_SEVERITIES, ALL_CONTEXTS, ALL_TRIGGERS } from "@/lib/constants/triage";
import { TriagePageClient } from "./TriagePageClient";

interface TriagePageProps {
  searchParams?: Promise<{
    accountId?: string;
    severity?: string | string[];
    contextLevel?: string | string[];
    context?: string | string[]; // Legacy support
    recommendedAction?: string | string[];
    strategyKey?: string | string[];
    trigger?: string | string[]; // Legacy support
    strategy?: string | string[]; // Legacy support
  }>;
}


export default async function TriagePage({ searchParams }: TriagePageProps) {
  const accounts = await getAccounts();
  const primaryAccount = await getPrimaryAccount();

  if (accounts.length === 0) {
    return (
      <DashboardShell
        activeNav="triage"
        title="Triage Queue"
        subtitle="Create an account to populate triage records."
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
        activeNav="triage"
        title="Triage Queue"
        subtitle="Create an account to populate triage records."
      >
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No accounts found. Head to <a href="/admin/accounts" className="text-blue-600 underline">Admin &gt; Accounts</a> to add one.
        </div>
      </DashboardShell>
    );
  }
  
  // Parse multi-select filters (can be string or string[])
  const severityParam = params?.severity;
  const severityFilter = Array.isArray(severityParam)
    ? severityParam
    : severityParam && severityParam !== "all"
    ? [severityParam]
    : [];
  
  const contextParam = params?.contextLevel || params?.context;
  const contextFilter = Array.isArray(contextParam)
    ? contextParam
    : contextParam && contextParam !== "all"
    ? [contextParam]
    : [];
  
  // URL uses "recommendedAction" and "strategyKey" to match query function
  const triggerParam = params?.recommendedAction || params?.trigger;
  const triggerFilter = Array.isArray(triggerParam) 
    ? triggerParam 
    : triggerParam 
    ? [triggerParam] 
    : [];
  
  const strategyParam = params?.strategyKey || params?.strategy;
  const strategyFilter = Array.isArray(strategyParam)
    ? strategyParam
    : strategyParam
    ? [strategyParam]
    : [];

  const sortParam = params?.sort;
  const directionParam = params?.direction as "asc" | "desc" | undefined;

  // Get all records first to extract unique values for dropdowns
  const allRecords = await getTriageQueue(account.id, {});

  // Use all available options (not just ones that exist in records)
  const allSeverities = [...ALL_SEVERITIES];
  const allContexts = [...ALL_CONTEXTS];
  const allTriggers = [...ALL_TRIGGERS];
  
  // Strategies are dynamic - extract from records
  const allStrategies = Array.from(
    new Set(
      allRecords.records
        .map((r) => r.strategyKey)
        .filter((r): r is string => r !== null)
    )
  ).sort();

  // Calculate counts for all options
  const severityCounts: Record<string, number> = {};
  allSeverities.forEach((severity) => {
    severityCounts[severity] = allRecords.records.filter(
      (r) => r.severity === severity
    ).length;
  });

  const contextCounts: Record<string, number> = {};
  allContexts.forEach((context) => {
    contextCounts[context] = allRecords.records.filter(
      (r) => r.contextLevel === context
    ).length;
  });

  const triggerCounts: Record<string, number> = {};
  allTriggers.forEach((trigger) => {
    triggerCounts[trigger] = allRecords.records.filter(
      (r) => r.recommendedAction === trigger
    ).length;
  });

  const strategyCounts: Record<string, number> = {};
  allStrategies.forEach((strategy) => {
    strategyCounts[strategy] = allRecords.records.filter(
      (r) => r.strategyKey === strategy
    ).length;
  });

  // Now get filtered records
  const queue = await getTriageQueue(account.id, {
    severity: severityFilter.length > 0 ? severityFilter : undefined,
    contextLevel: contextFilter.length > 0 ? contextFilter : undefined,
    recommendedAction: triggerFilter.length > 0 ? triggerFilter : undefined,
    strategyKey: strategyFilter.length > 0 ? strategyFilter : undefined,
    sort: sortParam,
    direction: directionParam,
  });

  return (
    <DashboardShell
      activeNav="triage"
      title={
        <div className="flex items-center gap-4">
          <span>Triage Queue</span>
          {queue.snapshotDate && (
            <span className="text-sm font-normal text-muted-foreground">
              Latest snapshot: {formatDateFull(queue.snapshotDate)}
            </span>
          )}
        </div>
      }
    >
      <div className="border-b bg-white px-6 py-4 -mx-4 -mt-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {accounts.length > 1 && (
            <AccountSelector
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              basePath="/triage"
            />
          )}
        </div>
        <TriageFilters
          severityFilter={severityFilter}
          contextFilter={contextFilter}
          triggerFilter={triggerFilter}
          strategyFilter={strategyFilter}
          allSeverities={allSeverities}
          allContexts={allContexts}
          allTriggers={allTriggers}
          allStrategies={allStrategies}
          severityCounts={severityCounts}
          contextCounts={contextCounts}
          triggerCounts={triggerCounts}
          strategyCounts={strategyCounts}
          totalFlags={queue.records.length}
        />
      </div>

      <TriagePageClient records={queue.records} />
    </DashboardShell>
  );
}



