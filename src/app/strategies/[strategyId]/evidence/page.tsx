import { redirect } from 'next/navigation';

interface EvidencePageProps {
  params: Promise<{ strategyId: string }>;
}

export default async function StrategyEvidencePage({ params }: EvidencePageProps) {
  const { strategyId } = await params;
  redirect(`/strategies/${strategyId}/overview`);
}
