import { redirect } from 'next/navigation';

interface StrategyDetailPageProps {
  params: Promise<{ strategyId: string }>;
}

export default async function StrategyDetailPage({ params }: StrategyDetailPageProps) {
  const { strategyId } = await params;
  // Redirect to overview tab as default
  redirect(`/strategies/${strategyId}/overview`);
}
