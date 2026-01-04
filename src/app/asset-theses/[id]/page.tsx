import { getAssetThesisById } from '@/db/queries/assetTheses';
import { getMacroThesesList } from '@/db/queries/macroTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getMainClaimsWithSourcesForAssetThesis } from '@/db/queries/assetTheses';
import { getLatestArticulation, getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { AssetThesisDetailClient } from '@/components/asset-theses/AssetThesisDetailClient';
import { AssetThesisDetailSections } from '@/components/asset-theses/AssetThesisDetailSections';
import { notFound } from 'next/navigation';

interface AssetThesisDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AssetThesisDetailPage({ params }: AssetThesisDetailPageProps) {
  const { id } = await params;

  const [view, claimsWithSources, allMacroTheses, allStrategies, articulation, validationPoints] = await Promise.all([
    getAssetThesisById(id),
    getMainClaimsWithSourcesForAssetThesis(id),
    getMacroThesesList(),
    getStrategiesForList(1000, { includeClosedStrategies: true }),
    getLatestArticulation(id, 'asset'),
    getActiveValidationPoints(id, 'asset'),
  ]);

  if (!view) {
    notFound();
  }

  // Filter macro theses and strategies linked to this asset thesis
  const linkedMacroThesesIds = view.linkedMacroTheses.map((lmt) => lmt.macroThesisId);

  const linkedMacroTheses = allMacroTheses.filter((mt) => linkedMacroThesesIds.includes(mt.id));
  const linkedStrategies = allStrategies.filter((s) => s.assetThesisId === id);

  return (
    <DashboardShell
      title={view.title}
      subtitle="Asset Thesis Detail"
      activeNav="asset-theses"
    >
      {/* Hierarchy Breadcrumb with Related Theses Management */}
      <AssetThesisDetailClient
        assetThesisId={view.id}
        assetThesisTitle={view.title}
        linkedMacroTheses={view.linkedMacroTheses.map((lmt) => ({
          id: lmt.id,
          macroThesisId: lmt.macroThesisId,
          title: lmt.title || '',
          relationshipNote: lmt.relationshipNote,
        }))}
      />

      <AssetThesisDetailSections
        view={view}
        claimsWithSources={claimsWithSources}
        linkedMacroTheses={linkedMacroTheses}
        linkedStrategies={linkedStrategies}
        articulation={articulation}
        validationPoints={validationPoints}
      />
    </DashboardShell>
  );
}
