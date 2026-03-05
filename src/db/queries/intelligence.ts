import { db } from '@/db';
import { intelligenceReports, intelligenceItems } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export interface IntelligenceReportWithItems {
  id: string;
  reportDate: string;
  generatedAt: Date;
  timeWindow: string | null;
  version: number | null;
  executiveSummary: string | null;
  keyThemes: string | null;
  fullMarkdown: string;
  criticalCount: number | null;
  highCount: number | null;
  mediumCount: number | null;
  infoCount: number | null;
  sectors: string[] | null;
  createdAt: Date;
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
}

export async function getLatestReport(): Promise<IntelligenceReportWithItems | null> {
  const reports = await db
    .select()
    .from(intelligenceReports)
    .orderBy(desc(intelligenceReports.generatedAt))
    .limit(1);

  if (reports.length === 0) return null;

  const report = reports[0];
  const items = await db
    .select()
    .from(intelligenceItems)
    .where(eq(intelligenceItems.reportId, report.id))
    .orderBy(
      sql`CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`
    );

  return { ...report, items };
}

export async function getReports(limit = 10, offset = 0) {
  const reports = await db
    .select({
      id: intelligenceReports.id,
      reportDate: intelligenceReports.reportDate,
      generatedAt: intelligenceReports.generatedAt,
      timeWindow: intelligenceReports.timeWindow,
      executiveSummary: intelligenceReports.executiveSummary,
      criticalCount: intelligenceReports.criticalCount,
      highCount: intelligenceReports.highCount,
      mediumCount: intelligenceReports.mediumCount,
      infoCount: intelligenceReports.infoCount,
      sectors: intelligenceReports.sectors,
      createdAt: intelligenceReports.createdAt,
    })
    .from(intelligenceReports)
    .orderBy(desc(intelligenceReports.generatedAt))
    .limit(limit)
    .offset(offset);

  return reports;
}

export async function getReportById(id: string): Promise<IntelligenceReportWithItems | null> {
  const reports = await db
    .select()
    .from(intelligenceReports)
    .where(eq(intelligenceReports.id, id))
    .limit(1);

  if (reports.length === 0) return null;

  const report = reports[0];
  const items = await db
    .select()
    .from(intelligenceItems)
    .where(eq(intelligenceItems.reportId, report.id))
    .orderBy(
      sql`CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`
    );

  return { ...report, items };
}

export async function getItems(
  reportId: string,
  filters?: { sector?: string; severity?: string }
) {
  let query = db
    .select()
    .from(intelligenceItems)
    .where(eq(intelligenceItems.reportId, reportId))
    .$dynamic();

  if (filters?.sector) {
    query = query.where(eq(intelligenceItems.sector, filters.sector));
  }
  if (filters?.severity) {
    query = query.where(eq(intelligenceItems.severity, filters.severity));
  }

  return query.orderBy(
    sql`CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`
  );
}
