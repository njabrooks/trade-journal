import { NextRequest, NextResponse } from 'next/server';
import {
  getMonitoringEventsByValidationPoint,
  getMonitoringEventsBySpec,
} from '@/db/queries/monitoring';

/**
 * GET /api/monitoring/events
 * List monitoring events for a validation point or spec
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const validationPointId = searchParams.get('validationPointId');
    const monitoringSpecId = searchParams.get('monitoringSpecId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (validationPointId) {
      // Get events for a validation point
      const events = await getMonitoringEventsByValidationPoint(validationPointId, limit);

      return NextResponse.json({
        events,
        totalCount: events.length,
      });
    } else if (monitoringSpecId) {
      // Get events for a specific spec
      const events = await getMonitoringEventsBySpec(monitoringSpecId, limit);

      return NextResponse.json({
        events,
        totalCount: events.length,
      });
    } else {
      return NextResponse.json(
        { error: 'Either validationPointId or monitoringSpecId is required' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error fetching monitoring events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monitoring events' },
      { status: 500 }
    );
  }
}
