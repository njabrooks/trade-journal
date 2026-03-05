'use client';

import { IntelligenceReportCard } from './IntelligenceReportCard';
import { EconomicCalendar } from './EconomicCalendar';
import { EarningsCalendar } from './EarningsCalendar';
import { SecFilingsFeed } from './SecFilingsFeed';

interface NewsDashboardContentProps {
  latestReport: {
    id: string;
    reportDate: string;
    generatedAt: Date;
    timeWindow: string | null;
    executiveSummary: string | null;
    criticalCount: number | null;
    highCount: number | null;
    mediumCount: number | null;
    infoCount: number | null;
    items: {
      id: string;
      severity: string;
      sector: string | null;
      headline: string;
      body: string | null;
      sourceUrls: string[] | null;
      relevantTickers: string[] | null;
      section: string | null;
    }[];
  } | null;
  economicEvents: {
    id: string;
    eventName: string;
    eventDate: string;
    eventTime: string | null;
    category: string | null;
    impact: string | null;
    country: string | null;
    actualValue: string | null;
    forecastValue: string | null;
    previousValue: string | null;
  }[];
  earningsEvents: {
    id: string;
    ticker: string;
    reportDate: string;
    reportTime: string | null;
    epsEstimate: string | null;
    epsActual: string | null;
    revenueEstimate: string | null;
    revenueActual: string | null;
    quarter: string | null;
  }[];
  secFilings: {
    id: string;
    ticker: string;
    filingType: string;
    filingCategory: string | null;
    filedDate: string;
    filingUrl: string;
    description: string | null;
    isMaterial: boolean | null;
  }[];
}

export function NewsDashboardContent({
  latestReport,
  economicEvents,
  earningsEvents,
  secFilings,
}: NewsDashboardContentProps) {
  return (
    <div className="space-y-4">
      {/* World Monitor Bulletin */}
      {latestReport ? (
        <IntelligenceReportCard report={latestReport} />
      ) : (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">No intelligence reports yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Reports appear here after the World Monitor runs.</p>
        </div>
      )}

      {/* Calendars side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EconomicCalendar events={economicEvents} />
        <EarningsCalendar events={earningsEvents} />
      </div>

      {/* SEC Filings */}
      <SecFilingsFeed filings={secFilings} />
    </div>
  );
}
