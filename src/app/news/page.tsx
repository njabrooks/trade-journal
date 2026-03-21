import { Metadata } from "next";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { IntelligenceFeed } from "@/components/news/IntelligenceFeed";
import { getUpcomingCalendar, getUnifiedFeed } from "@/db/queries/unifiedFeed";

export const metadata: Metadata = {
  title: "Intelligence Feed",
};

export default async function NewsPage() {
  const [upcoming, feed] = await Promise.all([
    getUpcomingCalendar(7),
    getUnifiedFeed({ limit: 100 }),
  ]);

  return (
    <DashboardShell
      activeNav="news"
      title="Intelligence Feed"
      subtitle="Unified view of intelligence briefings, economic data, filings, signals, and evidence"
    >
      <IntelligenceFeed upcoming={upcoming} initialFeed={feed} />
    </DashboardShell>
  );
}
