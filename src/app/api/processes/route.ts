import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveProcesses,
  getRecentProcesses,
  hasActiveProcesses,
} from '@/lib/services/processTracking';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId') || undefined;
    const jobType = searchParams.get('jobType') as any;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    if (activeOnly) {
      const active = await getActiveProcesses(accountId);
      return NextResponse.json({
        active: active.length > 0,
        processes: active,
        count: active.length,
      });
    }

    const recent = await getRecentProcesses(limit, accountId, jobType);
    const hasActive = await hasActiveProcesses(accountId);

    return NextResponse.json({
      processes: recent,
      hasActive,
      count: recent.length,
    });
  } catch (error) {
    console.error('Error fetching processes:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch processes',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
