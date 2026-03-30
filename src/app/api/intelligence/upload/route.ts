import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { intelligenceReports, intelligenceItems } from '@/db/schema';
import { parseWorldMonitor } from '@/lib/intelligence/parseWorldMonitor';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    // Auth via shared secret
    const authHeader = request.headers.get('Authorization');
    const expectedKey = process.env.INTELLIGENCE_UPLOAD_KEY;

    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { markdown } = body;

    if (!markdown || typeof markdown !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid "markdown" field' }, { status: 400 });
    }

    const parsed = parseWorldMonitor(markdown);

    // Check for existing report (idempotent upsert)
    const existing = await db
      .select({ id: intelligenceReports.id })
      .from(intelligenceReports)
      .where(
        and(
          eq(intelligenceReports.reportDate, parsed.reportDate),
          eq(intelligenceReports.generatedAt, new Date(parsed.generatedAt))
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({
        message: 'Report already exists',
        reportId: existing[0].id,
        deduplicated: true,
      });
    }

    // Insert report
    const [report] = await db
      .insert(intelligenceReports)
      .values({
        reportDate: parsed.reportDate,
        generatedAt: new Date(parsed.generatedAt),
        timeWindow: parsed.timeWindow,
        version: parsed.version,
        reportType: parsed.reportType,
        executiveSummary: parsed.executiveSummary,
        keyThemes: parsed.keyThemes,
        fullMarkdown: parsed.fullMarkdown,
        criticalCount: parsed.items.filter(i => i.severity === 'critical').length,
        highCount: parsed.items.filter(i => i.severity === 'high').length,
        mediumCount: parsed.items.filter(i => i.severity === 'medium').length,
        infoCount: parsed.items.filter(i => i.severity === 'info').length,
        sectors: parsed.sectors,
      })
      .returning({ id: intelligenceReports.id });

    // Insert items
    if (parsed.items.length > 0) {
      await db.insert(intelligenceItems).values(
        parsed.items.map(item => ({
          reportId: report.id,
          severity: item.severity,
          sector: item.sector,
          headline: item.headline,
          body: item.body,
          sourceUrls: item.sourceUrls,
          relevantTickers: item.relevantTickers,
          section: item.section,
        }))
      );
    }

    return NextResponse.json({
      message: 'Report uploaded successfully',
      reportId: report.id,
      itemCount: parsed.items.length,
      severityCounts: {
        critical: parsed.items.filter(i => i.severity === 'critical').length,
        high: parsed.items.filter(i => i.severity === 'high').length,
        medium: parsed.items.filter(i => i.severity === 'medium').length,
        info: parsed.items.filter(i => i.severity === 'info').length,
      },
    });
  } catch (error) {
    console.error('Error uploading intelligence report:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload intelligence report',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
