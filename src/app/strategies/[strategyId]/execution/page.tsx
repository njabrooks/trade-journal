import { redirect } from 'next/navigation';

interface ExecutionPageProps {
  params: Promise<{ strategyId: string }>;
}

export default async function StrategyExecutionPage({ params }: ExecutionPageProps) {
  const { strategyId } = await params;
  redirect(`/strategies/${strategyId}/triage`);
}
