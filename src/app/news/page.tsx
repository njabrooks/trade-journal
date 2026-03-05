import { Metadata } from "next";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { NewsDashboardContent } from "@/components/news/NewsDashboardContent";
import { getLatestReport } from "@/db/queries/intelligence";
import { getUpcomingEconomicEvents } from "@/db/queries/economicEvents";
import { getUpcomingEarnings } from "@/db/queries/earningsEvents";
import { getRecentFilings } from "@/db/queries/secFilings";

export const metadata: Metadata = {
  title: "News",
};

export default async function NewsPage() {
  const [latestReport, economicEvents, earningsEvents, secFilings] = await Promise.all([
    getLatestReport(),
    getUpcomingEconomicEvents(7),
    getUpcomingEarnings(14),
    getRecentFilings(7),
  ]);

  return (
    <DashboardShell
      activeNav="news"
      title="News Dashboard"
      subtitle="Intelligence briefings, economic calendar, earnings, and SEC filings"
    >
      <NewsDashboardContent
        latestReport={latestReport}
        economicEvents={economicEvents}
        earningsEvents={earningsEvents}
        secFilings={secFilings}
      />
    </DashboardShell>
  );
}
