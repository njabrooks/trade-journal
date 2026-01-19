import { Metadata } from 'next';
import { getResearchArtifactsListWithCounts } from '@/db/queries/research';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { UnifiedResearchBrowser } from '@/components/research/UnifiedResearchBrowser';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

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
          <div className="text-sm text-slate-600">
            {artifacts.length} {artifacts.length === 1 ? 'artifact' : 'artifacts'}
          </div>
          <Link href="/research/upload">
            <Button>Upload Research</Button>
          </Link>
        </div>

        <UnifiedResearchBrowser artifacts={artifacts} />
      </div>
    </DashboardShell>
  );
}
