import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { StrategyTabs } from '@/components/layout/StrategyTabs';
import { StrategyProvenanceChain } from '@/components/strategies/StrategyProvenanceChain';
import { getStrategyDetail } from '@/db/queries/strategies';
import type { ProvenanceData } from '@/app/api/strategies/[id]/provenance/route';

interface ProvenancePageProps {
  params: Promise<{ strategyId: string }>;
}

async function getProvenanceData(strategyId: string): Promise<ProvenanceData> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/strategies/${strategyId}/provenance`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch provenance data');
  }

  return response.json();
}

export default async function ProvenancePage({ params }: ProvenancePageProps) {
  const { strategyId } = await params;

  // Fetch strategy detail for page header
  const detail = await getStrategyDetail(strategyId);
  if (!detail) {
    notFound();
  }

  const { strategy } = detail;

  // Fetch provenance data
  const provenanceData = await getProvenanceData(strategyId);

  return (
    <DashboardShell
      activeNav="strategies"
      title={
        <div className="flex items-center gap-4">
          <span>{strategy.label ?? strategy.strategyKey}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {strategy.strategyKey} · {strategy.accountLabel ?? strategy.accountBrokerId ?? 'Unassigned'}
          </span>
        </div>
      }
      tabs={<StrategyTabs strategyId={strategyId} />}
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Strategy Provenance</h2>
          <p className="text-slate-600 mt-1">
            Why am I holding these positions? Trace the full decision hierarchy from positions to supporting claims.
          </p>
        </div>

        <StrategyProvenanceChain data={provenanceData} />
      </div>
    </DashboardShell>
  );
}
