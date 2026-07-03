import { Metadata } from 'next';
import { db } from '@/db';
import { morningBriefs } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { BriefHistoryClient } from './BriefHistoryClient';
import type { Brief } from '@/components/brief/BriefView';

export const metadata: Metadata = {
  title: 'Morning Brief',
};

export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 90;

/**
 * Morning-brief history (docs/v2/20 Lane A follow-on) — every generated brief kept as
 * a browsable record, latest selected by default. Same saved-reports shape as the Vol
 * Curve analyzer: the producer writes one row per day; this page is the archive.
 */
export default async function BriefPage() {
  const rows = await db
    .select({
      id: morningBriefs.id,
      briefDate: morningBriefs.briefDate,
      headline: morningBriefs.headline,
      attention: morningBriefs.attention,
      bodyMd: morningBriefs.bodyMd,
      updatedAt: morningBriefs.updatedAt,
    })
    .from(morningBriefs)
    .orderBy(desc(morningBriefs.briefDate))
    .limit(HISTORY_LIMIT);

  const briefs: Brief[] = rows.map((r) => ({
    ...r,
    attention: (r.attention ?? []) as Brief['attention'],
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <DashboardShell
      title="Morning Brief"
      subtitle="Daily synthesis — what deserves your attention, one brief per day"
      activeNav="brief"
    >
      <BriefHistoryClient briefs={briefs} />
    </DashboardShell>
  );
}
