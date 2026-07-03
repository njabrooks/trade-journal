import { Metadata } from 'next';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { DecisionCards } from '@/components/decisions/DecisionCards';

export const metadata: Metadata = {
  title: 'Decisions',
};

/**
 * Decision Cards v2 (Lane B, docs/v2/20) — the web twin of the /decisions skill.
 * One card per thesis/object bundling its active decision packets; mechanical
 * packets resolve one-click, judgment packets deep-link to their agent runbook.
 */
export default function DecisionsPage() {
  return (
    <DashboardShell
      title="Decisions"
      subtitle="Open decision packets, grouped by thesis"
      activeNav="decisions"
    >
      <DecisionCards />
    </DashboardShell>
  );
}
