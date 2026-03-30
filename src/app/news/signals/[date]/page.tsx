import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { getQuantSnapshotsByDate } from '@/db/queries/quantDaily';
import { QuantDailyView } from './QuantDailyView';

interface Props {
  params: Promise<{ date: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  const dateStr = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return { title: `Signal Observations — ${dateStr}` };
}

export default async function QuantDailyPage({ params }: Props) {
  const { date } = await params;

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const summary = await getQuantSnapshotsByDate(date);
  if (!summary) notFound();

  const dateStr = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <DashboardShell activeNav="news" title={`Signal Observations — ${dateStr}`}>
      <div className="space-y-4">
        <Link
          href="/news"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to feed
        </Link>

        <QuantDailyView summary={summary} />
      </div>
    </DashboardShell>
  );
}
