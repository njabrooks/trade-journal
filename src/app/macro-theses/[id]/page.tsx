import { getMacroThesisById, getMainClaimsWithSourcesForThesis } from '@/db/queries/macroTheses';
import { getAssetThesesList } from '@/db/queries/assetTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getAssetThesesForRelatedMacroThesis } from '@/db/queries/relatedMacroTheses';
import { getLatestArticulation, getActiveValidationPoints } from '@/db/queries/thesisSynthesis';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { EditMacroThesisButton } from '@/components/theses/EditMacroThesisButton';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import { LinkedAssetThesesSection } from '@/components/theses/LinkedAssetThesesSection';
import { UnifiedStrategiesBrowser } from '@/components/strategies/UnifiedStrategiesBrowser';
import { ThesisSynthesisSection } from '@/components/thesis-synthesis';
import { notFound } from 'next/navigation';

interface ThesisDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ThesisDetailPage({ params }: ThesisDetailPageProps) {
  const { id } = await params;
  
  const [thesis, claimsWithSources, allAssetTheses, allStrategies, relatedAssetThesisLinks, articulation, validationPoints] = await Promise.all([
    getMacroThesisById(id),
    getMainClaimsWithSourcesForThesis(id),
    getAssetThesesList(),
    getStrategiesForList(1000, { includeClosedStrategies: true }),
    getAssetThesesForRelatedMacroThesis(id),
    getLatestArticulation(id, 'macro'),
    getActiveValidationPoints(id, 'macro'),
  ]);

  if (!thesis) {
    notFound();
  }

  // Filter asset theses linked to this macro thesis (via junction table)
  const relatedAssetThesisIds = new Set(relatedAssetThesisLinks.map((link) => link.assetThesisId));
  const linkedAssetTheses = allAssetTheses.filter((at) => relatedAssetThesisIds.has(at.id));

  // Strategies are linked through asset theses - filter by those with a linked macro thesis matching this id
  const linkedStrategies = allStrategies.filter((s) =>
    s.linkedMacroTheses.some((lmt) => lmt.id === id)
  );

  return (
    <DashboardShell
      title={thesis.title}
      subtitle="Macro Thesis Detail"
      activeNav="macro-theses"
    >
      <div className="space-y-6">
        {/* Compact Overview */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Overview</h3>
            <EditMacroThesisButton thesis={thesis} />
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Type</dt>
              <dd className="mt-0.5 text-sm text-slate-900 capitalize">{thesis.thesisType}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Direction</dt>
              <dd className="mt-0.5">
                {thesis.direction ? (
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    thesis.direction === 'bullish' ? 'bg-emerald-100 text-emerald-700' :
                    thesis.direction === 'bearish' ? 'bg-red-100 text-red-700' :
                    'bg-slate-200 text-slate-700'
                  }`}>
                    {thesis.direction}
                  </span>
                ) : <span className="text-sm text-slate-500">—</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Time Horizon</dt>
              <dd className="mt-0.5 text-sm text-slate-900">
                {thesis.timeHorizon?.replace('_', ' ') ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Confidence</dt>
              <dd className="mt-0.5 text-sm text-slate-900 capitalize">
                {thesis.confidenceLevel ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Status</dt>
              <dd className="mt-0.5">
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                  thesis.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                  thesis.status === 'under_review' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-200 text-slate-700'
                }`}>
                  {thesis.status}
                </span>
              </dd>
            </div>
            <div className="col-span-2 md:col-span-3">
              <dt className="text-xs font-medium text-slate-500 mb-1">Sectors / Topics</dt>
              <dd className="flex flex-wrap gap-1">
                {thesis.sectors && thesis.sectors.length > 0 ? (
                  thesis.sectors.map((sector) => (
                    <span
                      key={sector}
                      className="inline-flex px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-md"
                    >
                      {sector}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">No sectors defined</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Summary (formerly Description) */}
        {thesis.description ? (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold mb-3">Summary</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{thesis.description}</p>
          </div>
        ) : null}

        {/* Thesis Synthesis - Articulation & Validation Points */}
        <ThesisSynthesisSection
          thesisId={id}
          thesisType="macro"
          articulation={articulation}
          validationPoints={validationPoints}
          claimCount={claimsWithSources.length}
        />

        {/* Main Claims - UnifiedClaimsBrowser */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-base font-semibold mb-3">
            Main Claims ({claimsWithSources.length})
          </h3>
          {claimsWithSources.length === 0 ? (
            <p className="text-sm text-slate-500">No main claims linked to this thesis yet.</p>
          ) : (
            <UnifiedClaimsBrowser claimsWithSources={claimsWithSources} />
          )}
        </div>

        {/* Linked Asset Theses - with Link Button */}
        <LinkedAssetThesesSection
          macroThesisId={thesis.id}
          macroThesisTitle={thesis.title}
          linkedAssetTheses={linkedAssetTheses}
        />

        {/* Linked Strategies - UnifiedStrategiesBrowser */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-base font-semibold mb-3">
            Linked Strategies ({linkedStrategies.length})
          </h3>
          {linkedStrategies.length === 0 ? (
            <p className="text-sm text-slate-500">No strategies linked to this macro thesis yet.</p>
          ) : (
            <UnifiedStrategiesBrowser strategies={linkedStrategies} />
          )}
        </div>

        {/* Notes - Moved to bottom */}
        {thesis.notes !== null && thesis.notes !== undefined ? (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold mb-3">Notes</h3>
            <pre className="text-sm text-slate-700 whitespace-pre-wrap">
              {JSON.stringify(thesis.notes, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
