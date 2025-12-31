import { getAssetThesisById } from '@/db/queries/assetTheses';
import { getMacroThesesList } from '@/db/queries/macroTheses';
import { getStrategiesForList } from '@/db/queries/strategies';
import { getMainClaimsWithSourcesForAssetThesis } from '@/db/queries/assetTheses';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { AssetThesisDetailClient } from '@/components/asset-theses/AssetThesisDetailClient';
import { EditAssetThesisButton } from '@/components/asset-theses/EditAssetThesisButton';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import { UnifiedMacroThesisBrowser } from '@/components/theses/UnifiedMacroThesisBrowser';
import { UnifiedStrategiesBrowser } from '@/components/strategies/UnifiedStrategiesBrowser';
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
  // Include primary macro thesis + all related macro theses
  const linkedMacroThesesIds = [
    view.primaryMacroThesis?.id,
    ...(view.relatedMacroTheses?.map((r) => r.macroThesisId) || []),
  ].filter(Boolean) as string[];
  
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
        primaryMacroThesis={
          view.primaryMacroThesis
            ? { id: view.primaryMacroThesis.id, title: view.primaryMacroThesis.title }
            : null
        }
        relatedMacroTheses={
          view.relatedMacroTheses?.map((r) => ({
            id: r.id,
            macroThesisId: r.macroThesisId || '',
            title: r.title || '',
            relationshipNote: r.relationshipNote,
          })) || []
        }
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

        {/* Summary (formerly Description) */}
        {view.description ? (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold mb-3">Summary</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{view.description}</p>
          </div>
        ) : null}

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

        {/* Linked Macro Theses - UnifiedMacroThesisBrowser */}
        {linkedMacroTheses.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold mb-3">
              Linked Macro Theses ({linkedMacroTheses.length})
            </h3>
            <UnifiedMacroThesisBrowser theses={linkedMacroTheses} />
          </div>
        )}

        {/* Linked Strategies - UnifiedStrategiesBrowser */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-base font-semibold mb-3">
            Linked Strategies ({linkedStrategies.length})
          </h3>
          {linkedStrategies.length === 0 ? (
            <p className="text-sm text-slate-500">No strategies linked to this asset thesis yet.</p>
          ) : (
            <UnifiedStrategiesBrowser strategies={linkedStrategies} />
          )}
        </div>

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

