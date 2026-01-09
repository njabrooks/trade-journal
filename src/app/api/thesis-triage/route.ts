import { NextRequest, NextResponse } from 'next/server';
import { getThesisTriageQueueFull, getThesisTriageQueueCounts, type ThesisTriageFilters } from '@/db/queries/triage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse filters from query params
    const filters: ThesisTriageFilters = {};

    const status = searchParams.getAll('status');
    if (status.length > 0) {
      filters.status = status;
    }

    const severity = searchParams.getAll('severity');
    if (severity.length > 0) {
      filters.severity = severity;
    }

    const thesisType = searchParams.getAll('thesisType');
    if (thesisType.length > 0) {
      filters.thesisType = thesisType;
    }

    const lifecycleStage = searchParams.getAll('lifecycleStage');
    if (lifecycleStage.length > 0) {
      filters.lifecycleStage = lifecycleStage;
    }

    const thesisId = searchParams.get('thesisId');
    if (thesisId) {
      filters.thesisId = thesisId;
    }

    // Fetch data in parallel - use Full version to get JSONB fields
    const [records, counts] = await Promise.all([
      getThesisTriageQueueFull(filters),
      getThesisTriageQueueCounts(),
    ]);

    return NextResponse.json({
      records,
      counts,
    });
  } catch (error) {
    console.error('Error fetching thesis triage queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch thesis triage queue' },
      { status: 500 }
    );
  }
}
