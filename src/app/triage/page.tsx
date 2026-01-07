import { DashboardShell } from "@/components/layout/DashboardShell";
import { AccountSelector } from "@/components/layout/AccountSelector";
import { UnifiedTriageBrowser } from "@/components/triage/UnifiedTriageBrowser";
import { getPrimaryAccount, getAccounts } from "@/db/queries/accounts";
import { getUnifiedTriageQueue } from "@/db/queries/triage";

interface TriagePageProps {
  searchParams?: Promise<{
    accountId?: string;
  }>;
}

export default async function TriagePage({ searchParams }: TriagePageProps) {
  const accounts = await getAccounts();
  const primaryAccount = await getPrimaryAccount();

  if (accounts.length === 0) {
    return (
      <DashboardShell
        activeNav="triage"
        title="Triage Inbox"
        subtitle="Unified workflow queue for theses, strategies, and positions"
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
        title="Triage Inbox"
        subtitle="Unified workflow queue for theses, strategies, and positions"
      >
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No accounts found. Head to <a href="/admin/accounts" className="text-blue-600 underline">Admin &gt; Accounts</a> to add one.
        </div>
      </DashboardShell>
    );
  }

  // Fetch unified triage queue (position/strategy + thesis triage combined)
  const { records, counts } = await getUnifiedTriageQueue(account.id);

  return (
    <DashboardShell
      activeNav="triage"
      title="Triage Inbox"
      subtitle="Unified workflow queue for theses, strategies, and positions"
    >
      {/* Account Selector */}
      {accounts.length > 1 && (
        <div className="mb-4">
          <AccountSelector
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            basePath="/triage"
          />
        </div>
      )}

      {/* Unified Triage Browser */}
      <UnifiedTriageBrowser records={records} counts={counts} />
    </DashboardShell>
  );
}
