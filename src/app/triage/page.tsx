import { Metadata } from "next";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { UnifiedTriageBrowser } from "@/components/triage/UnifiedTriageBrowser";
import { getUnifiedTriageQueue } from "@/db/queries/triage";

export const metadata: Metadata = {
  title: "Triage",
};

export default async function TriagePage() {
  // Fetch unified triage queue across all accounts (position/strategy + thesis triage combined)
  // includeAll: true to fetch all records including dismissed (UI filters client-side)
  const { records, counts } = await getUnifiedTriageQueue({ includeAll: true });

  return (
    <DashboardShell
      activeNav="triage"
      title="Triage Inbox"
      subtitle="Unified workflow queue for theses, strategies, and positions"
    >
      {/* Unified Triage Browser - shows records from all accounts */}
      <UnifiedTriageBrowser records={records} counts={counts} />
    </DashboardShell>
  );
}
