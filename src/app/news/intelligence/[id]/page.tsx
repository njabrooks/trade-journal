import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { getReportById } from '@/db/queries/intelligence';
import { IntelligenceReportView } from './IntelligenceReportView';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const report = await getReportById(id);
  if (!report) return { title: 'Report Not Found' };
  const label = report.fullMarkdown.includes('Thesis Monitor') ? 'Thesis Monitor' : 'World Monitor';
  return { title: `${label} — ${report.reportDate}` };
}

export default async function IntelligenceReportPage({ params }: Props) {
  const { id } = await params;
  const report = await getReportById(id);
  if (!report) notFound();

  const label = report.fullMarkdown.includes('Thesis Monitor') ? 'Thesis Monitor' : 'World Monitor';

  return (
    <DashboardShell activeNav="news" title={`${label} — ${report.reportDate}`}>
      <div className="space-y-4">
        <Link
          href="/news"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to feed
        </Link>

        <IntelligenceReportView report={report} />
      </div>
    </DashboardShell>
  );
}
