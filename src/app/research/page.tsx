import { Metadata } from 'next';
import { getResearchArtifactsListWithCounts } from '@/db/queries/research';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { UnifiedResearchBrowser } from '@/components/research/UnifiedResearchBrowser';

export const metadata: Metadata = {
  title: 'Research',
};

export default async function ResearchPage() {
  const artifacts = await getResearchArtifactsListWithCounts();

  return (
    <DashboardShell
      title="Research Library"
      subtitle="Research artifacts and insights"
      activeNav="research"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {artifacts.length} {artifacts.length === 1 ? 'artifact' : 'artifacts'}
          </div>
        </div>

        <UnifiedResearchBrowser artifacts={artifacts} />
      </div>
    </DashboardShell>
  );
}
