import { getMacroThesisById } from '@/db/queries/macroTheses';
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
    getMacroThesisById(id),
    getSignalById(signalId),
  ]);

  if (!thesis) {
    notFound();
  }

  if (!signal) {
    notFound();
  }

  // Verify the signal belongs to this thesis
  if (signal.thesisId !== id || signal.thesisType !== 'macro') {
    notFound();
  }

  return (
    <DashboardShell
      title={`Signal`}
      subtitle={thesis.title}
      activeNav="macro-theses"
    >
      <ValidationPointDetailClient
        validationPoint={signal}
        thesisTitle={thesis.title}
        thesisType="macro"
        thesisId={id}
      />
    </DashboardShell>
  );
}
