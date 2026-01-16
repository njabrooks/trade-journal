import { getAllMainClaimsWithSources } from '@/db/queries/research';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function ClaimsBrowserPage() {
  const claimsWithSources = await getAllMainClaimsWithSources();

  // Calculate statistics (using standardized status values #ENH-048)
  const totalClaims = claimsWithSources.length;
  const draftCount = claimsWithSources.filter(item => item.claim.status === 'draft').length;
  const activeCount = claimsWithSources.filter(item => item.claim.status === 'active').length;
  const completeCount = claimsWithSources.filter(item => item.claim.status === 'complete').length;
  const rejectedCount = claimsWithSources.filter(item => item.claim.status === 'rejected').length;

  // Count unique sources
  const uniqueSources = new Set(
    claimsWithSources
      .filter(item => item.artifact)
      .map(item => item.artifact!.id)
  ).size;

  return (
    <DashboardShell
      title="Claims Browser"
      subtitle="All claims across research sources"
      activeNav="claims"
    >
      <div className="space-y-6">
        {/* Statistics Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Overview</h3>
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <dt className="text-sm font-medium text-slate-500">Research Sources</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900">{uniqueSources}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Total Claims</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900">{totalClaims}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Draft</dt>
              <dd className="mt-1 text-2xl font-semibold text-amber-600">{draftCount}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Active</dt>
              <dd className="mt-1 text-2xl font-semibold text-emerald-600">{activeCount}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Rejected</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-500">{rejectedCount}</dd>
            </div>
          </dl>
        </div>

        {/* Claims Browser */}
        {claimsWithSources.length > 0 ? (
          <UnifiedClaimsBrowser claimsWithSources={claimsWithSources} />
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-600 mb-4">No claims found in your research library.</p>
            <p className="text-sm text-slate-500 mb-6">
              Upload research and process it with the <code className="bg-slate-100 px-2 py-1 rounded">/process-transcript</code> skill to extract claims.
            </p>
            <Link href="/research/upload">
              <Button>Upload Research</Button>
            </Link>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
