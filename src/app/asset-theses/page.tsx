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
          <div className="text-sm text-muted-foreground">
            {assetTheses.length} {assetTheses.length === 1 ? 'thesis' : 'theses'}
          </div>
          <CreateAssetThesisButton />
        </div>

        {assetTheses.length === 0 ? (
          <div className="bg-card rounded-lg border border p-12 text-center text-muted-foreground">
            No asset theses yet. Create your first thesis to get started.
          </div>
        ) : (
          <UnifiedAssetThesisBrowser assetTheses={assetTheses} />
        )}
      </div>
    </DashboardShell>
  );
}
