import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { getSignalWithEntitiesById } from '@/db/queries/signals';
import { isUuid } from '@/lib/utils';
import { SignalDetailClient } from './SignalDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: 'Signal' };
  const signal = await getSignalWithEntitiesById(id);
  const title = signal
    ? `${signal.statement.slice(0, 60)}${signal.statement.length > 60 ? '…' : ''}`
    : 'Signal';
  return { title };
}

export default async function SignalDetailPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const signal = await getSignalWithEntitiesById(id);
  if (!signal) notFound();

  // Build a readable title from linked entities
  const entity = signal.entities[0];
  const pageTitle = entity?.entityTitle
    ? `Signal — ${entity.entityTitle}`
    : 'Signal';

  return (
    <DashboardShell activeNav="signals" title={pageTitle}>
      <SignalDetailClient signal={signal} />
    </DashboardShell>
  );
}
