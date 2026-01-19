import { Metadata } from 'next';
import { getAssetThesesList } from '@/db/queries/assetTheses';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { CreateAssetThesisButton } from '@/components/asset-theses/CreateAssetThesisButton';
import { UnifiedAssetThesisBrowser } from '@/components/asset-theses/UnifiedAssetThesisBrowser';

export const metadata: Metadata = {
  title: 'Asset Theses',
};

export default async function AssetThesesPage() {
  const assetTheses = await getAssetThesesList();

  return (
    <DashboardShell
      title="Asset Theses"
      subtitle="Asset-specific theses and investment beliefs"
      activeNav="asset-theses"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-slate-600">
            {assetTheses.length} {assetTheses.length === 1 ? 'thesis' : 'theses'}
          </div>
          <CreateAssetThesisButton />
        </div>

        {assetTheses.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500">
            No asset theses yet. Create your first thesis to get started.
          </div>
        ) : (
          <UnifiedAssetThesisBrowser assetTheses={assetTheses} />
        )}
      </div>
    </DashboardShell>
  );
}
