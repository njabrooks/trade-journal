import { NextRequest, NextResponse } from 'next/server';
import { getMonitoringSpecById, createMonitoringEvent, updateSpecCheckTime } from '@/db/queries/monitoring';
import { runMonitoringCheck } from '@/lib/services/monitoring';
import type { DataSource } from '@/lib/services/monitoring/types';

/**
 * POST /api/monitoring/check/:specId
 * Run a manual monitoring check
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ specId: string }> }
) {
  try {
    // Await params (Next.js 16 requirement)
    const { specId } = await params;

    // Get monitoring spec
    const spec = await getMonitoringSpecById(specId);
    if (!spec) {
      return NextResponse.json({ error: 'Monitoring spec not found' }, { status: 404 });
    }

    // Parse request body (optional overrides)
    const body = await request.json().catch(() => ({}));
    const { dataSources, dateRange } = body;

    // Run check
    const checkResults = await runMonitoringCheck(spec, {
      dataSources: dataSources as DataSource[] | undefined,
      dateRange,
    });

    // Save results to database (one event per data source)
    const savedEvents = [];

    for (const [dataSource, result] of Object.entries(checkResults.results)) {
      const event = await createMonitoringEvent({
        monitoringSpecId: spec.id,
        validationPointId: spec.validationPointId,
        checkedBy: 'user', // Phase 3.2A: all checks are manual
        dataSource: dataSource as DataSource,
        queryParams: {
          keywords: spec.keywords,
          dateRange,
          sources: spec.sources,
        },
        resultsCount: result.count,
        resultsSummary: result.items,
      });

      savedEvents.push(event);
    }

    // Update spec's last checked time
    await updateSpecCheckTime(spec.id);

    return NextResponse.json({
      success: true,
      checkedAt: checkResults.checkedAt,
      results: checkResults.results,
      totalResults: checkResults.totalResults,
      errors: checkResults.errors,
      events: savedEvents,
    });
  } catch (error) {
    console.error('Error running monitoring check:', error);
    return NextResponse.json(
      {
        error: 'Failed to run monitoring check',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
