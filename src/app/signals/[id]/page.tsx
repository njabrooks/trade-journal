import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { getSignalWithEntitiesById } from '@/db/queries/signals';
import { SignalDetailClient } from './SignalDetailClient';

export const metadata: Metadata = { title: 'Signal' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SignalDetailPage({ params }: Props) {
  const { id } = await params;
  const signal = await getSignalWithEntitiesById(id);
  if (!signal) notFound();

  return (
    <DashboardShell activeNav="signals" title="Signal">
      <SignalDetailClient signal={signal} />
    </DashboardShell>
  );
}
