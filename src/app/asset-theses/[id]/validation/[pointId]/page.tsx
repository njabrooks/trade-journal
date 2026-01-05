import { getAssetThesisById } from '@/db/queries/assetTheses';
import { getValidationPointById } from '@/db/queries/thesisSynthesis';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { ValidationPointDetailClient } from './ValidationPointDetailClient';
import { notFound } from 'next/navigation';

interface ValidationPointPageProps {
  params: Promise<{ id: string; pointId: string }>;
}

export default async function ValidationPointPage({ params }: ValidationPointPageProps) {
  const { id, pointId } = await params;

  const [thesis, validationPoint] = await Promise.all([
    getAssetThesisById(id),
    getValidationPointById(pointId),
  ]);

  if (!thesis) {
    notFound();
  }

  if (!validationPoint) {
    notFound();
  }

  // Verify the validation point belongs to this thesis
  if (validationPoint.thesisId !== id || validationPoint.thesisType !== 'asset') {
    notFound();
  }

  return (
    <DashboardShell
      title={`Validation Point`}
      subtitle={thesis.title}
      activeNav="asset-theses"
    >
      <ValidationPointDetailClient
        validationPoint={validationPoint}
        thesisTitle={thesis.title}
        thesisType="asset"
        thesisId={id}
      />
    </DashboardShell>
  );
}
