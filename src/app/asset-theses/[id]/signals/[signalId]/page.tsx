import { getAssetThesisById } from '@/db/queries/assetTheses';
import { getSignalById } from '@/db/queries/thesisSynthesis';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { ValidationPointDetailClient } from './ValidationPointDetailClient';
import { notFound } from 'next/navigation';

interface SignalPageProps {
  params: Promise<{ id: string; signalId: string }>;
}

export default async function SignalPage({ params }: SignalPageProps) {
  const { id, signalId } = await params;

  const [thesis, signal] = await Promise.all([
    getAssetThesisById(id),
    getSignalById(signalId),
  ]);

  if (!thesis) {
    notFound();
  }

  if (!signal) {
    notFound();
  }

  // Verify the signal belongs to this thesis
  if (signal.thesisId !== id || signal.thesisType !== 'asset') {
    notFound();
  }

  return (
    <DashboardShell
      title={`Signal`}
      subtitle={thesis.title}
      activeNav="asset-theses"
    >
      <ValidationPointDetailClient
        validationPoint={signal}
        thesisTitle={thesis.title}
        thesisType="asset"
        thesisId={id}
      />
    </DashboardShell>
  );
}
