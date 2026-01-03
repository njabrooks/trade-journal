import { getAssetThesisById } from '@/db/queries/assetTheses';
import { getMacroThesesList } from '@/db/queries/macroTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getMainClaimsWithSourcesForAssetThesis } from '@/db/queries/assetTheses';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { AssetThesisDetailClient } from '@/components/asset-theses/AssetThesisDetailClient';
import { EditAssetThesisButton } from '@/components/asset-theses/EditAssetThesisButton';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import { LinkedMacroThesesSection } from '@/components/asset-theses/LinkedMacroThesesSection';
import { LinkedStrategiesSection } from '@/components/asset-theses/LinkedStrategiesSection';
import { notFound } from 'next/navigation';

interface AssetThesisDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AssetThesisDetailPage({ params }: AssetThesisDetailPageProps) {
  const { id } = await params;
  
  const [view, claimsWithSources, allMacroTheses, allStrategies] = await Promise.all([
    getAssetThesisById(id),
    getMainClaimsWithSourcesForAssetThesis(id),
    getMacroThesesList(),
    getStrategiesForList(1000, { includeClosedStrategies: true }),
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

      <div className="space-y-6">
        {/* Compact Overview */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Overview</h3>
            <EditAssetThesisButton thesis={view} />
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Underlying</dt>
              <dd className="mt-0.5 text-sm text-slate-900 font-mono">
                {view.underlying?.ticker ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Direction</dt>
              <dd className="mt-0.5">
                {view.direction ? (
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    view.direction === 'bullish' ? 'bg-emerald-100 text-emerald-700' :
                    view.direction === 'bearish' ? 'bg-red-100 text-red-700' :
                    'bg-slate-200 text-slate-700'
                  }`}>
                    {view.direction}
                  </span>
                ) : <span className="text-sm text-slate-500">—</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Time Horizon</dt>
              <dd className="mt-0.5 text-sm text-slate-900">
                {view.timeHorizon?.replace('_', ' ') ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Confidence</dt>
              <dd className="mt-0.5 text-sm text-slate-900">
                {view.confidenceLevel ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Status</dt>
              <dd className="mt-0.5">
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                  view.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                  view.status === 'under_review' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-200 text-slate-700'
                }`}>
                  {view.status}
                </span>
              </dd>
            </div>
            {view.targetPrice && (
              <div>
                <dt className="text-xs font-medium text-slate-500">Target Price</dt>
                <dd className="mt-0.5 text-sm text-slate-900 font-mono">
                  ${Number(view.targetPrice).toFixed(2)}
                </dd>
              </div>
            )}
            {view.entryReferencePrice && (
              <div>
                <dt className="text-xs font-medium text-slate-500">Entry Reference</dt>
                <dd className="mt-0.5 text-sm text-slate-900 font-mono">
                  ${Number(view.entryReferencePrice).toFixed(2)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Summary Section - AI + Manual */}
        {(view.aiSummary || view.description) && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Summary</h3>
              {view.aiSummary && view.aiSummaryGeneratedAt && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>
                    {new Date(view.aiSummaryGeneratedAt).toLocaleDateString()}
                  </span>
                  <span>•</span>
                  <span>{view.aiSummaryClaimCount} claims</span>
                </div>
              )}
            </div>

            {/* AI Summary */}
            {view.aiSummary && (
              <div className="mb-4">
                <div className="text-sm whitespace-pre-wrap text-slate-900">
                  {view.aiSummary}
                </div>

                {/* Staleness warning */}
                {(() => {
                  const currentClaimCount = claimsWithSources?.length ?? 0;
                  const newClaims = currentClaimCount - (view.aiSummaryClaimCount ?? 0);
                  const daysOld = view.aiSummaryGeneratedAt
                    ? Math.floor((Date.now() - new Date(view.aiSummaryGeneratedAt).getTime()) / (1000 * 60 * 60 * 24))
                    : 0;

                  if (newClaims >= 3) {
                    return (
                      <div className="mt-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                        ⚠️ {newClaims} new claims added since generation — consider regenerating with /generate-summary
                      </div>
                    );
                  }

                  if (daysOld >= 30) {
                    return (
                      <div className="mt-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                        ⚠️ Summary is {daysOld} days old — consider regenerating with /generate-summary
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>
            )}

            {/* Manual Description */}
            {view.description && (
              <div>
                <span className="text-xs font-medium text-slate-500 block mb-2">
                  MANUAL DESCRIPTION
                </span>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {view.description}
                </p>
              </div>
            )}

            {!view.aiSummary && !view.description && (
              <p className="text-sm text-slate-500">
                No summary available. Use <code className="px-1 py-0.5 bg-slate-100 rounded text-xs">/generate-summary {view.underlying?.ticker || view.id}</code> to create one.
              </p>
            )}
          </div>
        )}

        {/* Underlying Market Data */}
        {view.underlying && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold mb-3">Underlying Market Data</h3>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
              <div>
                <dt className="text-xs font-medium text-slate-500">Name</dt>
                <dd className="mt-0.5 text-sm text-slate-900">{view.underlying.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Asset Class</dt>
                <dd className="mt-0.5 text-sm text-slate-900">{view.underlying.assetClass ?? '—'}</dd>
              </div>
              {view.underlying.spot && (
                <div>
                  <dt className="text-xs font-medium text-slate-500">Spot</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 font-mono">
                    ${Number(view.underlying.spot).toFixed(2)}
                  </dd>
                </div>
              )}
              {view.underlying.iv30 && (
                <div>
                  <dt className="text-xs font-medium text-slate-500">IV30</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 font-mono">
                    {(Number(view.underlying.iv30) * 100).toFixed(1)}%
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

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

        {/* Linked Macro Theses - with Link Button */}
        <LinkedMacroThesesSection
          assetThesisId={view.id}
          assetThesisTitle={view.title}
          linkedMacroTheses={linkedMacroTheses}
        />

        {/* Linked Strategies - with Link Button */}
        <LinkedStrategiesSection
          assetThesisId={view.id}
          assetThesisTitle={view.title}
          linkedStrategies={linkedStrategies}
        />

        {/* Notes - Moved to bottom */}
        {view.notes !== null && view.notes !== undefined ? (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold mb-3">Notes</h3>
            <pre className="text-sm text-slate-700 whitespace-pre-wrap">
              {JSON.stringify(view.notes, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}

