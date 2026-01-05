import { NextRequest, NextResponse } from 'next/server';
import {
  getMonitoringSpecById,
  updateMonitoringSpec,
  deleteMonitoringSpec,
} from '@/db/queries/monitoring';

/**
 * GET /api/monitoring/specs/:id
 * Get a single monitoring spec
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 16 requirement)
    const { id } = await params;
    const spec = await getMonitoringSpecById(id);

    if (!spec) {
      return NextResponse.json({ error: 'Monitoring spec not found' }, { status: 404 });
    }

    return NextResponse.json({ spec });
  } catch (error) {
    console.error('Error fetching monitoring spec:', error);
    return NextResponse.json({ error: 'Failed to fetch monitoring spec' }, { status: 500 });
  }
}

/**
 * PUT /api/monitoring/specs/:id
 * Update a monitoring spec
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 16 requirement)
    const { id } = await params;
    const body = await request.json();

    // Check if spec exists
    const existing = await getMonitoringSpecById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Monitoring spec not found' }, { status: 404 });
    }

    // Update spec
    const updated = await updateMonitoringSpec(id, body);

    return NextResponse.json({ success: true, spec: updated });
  } catch (error) {
    console.error('Error updating monitoring spec:', error);
    return NextResponse.json(
      {
        error: 'Failed to update monitoring spec',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/monitoring/specs/:id
 * Delete a monitoring spec
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 16 requirement)
    const { id } = await params;

    // Check if spec exists
    const existing = await getMonitoringSpecById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Monitoring spec not found' }, { status: 404 });
    }

    await deleteMonitoringSpec(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting monitoring spec:', error);
    return NextResponse.json({ error: 'Failed to delete monitoring spec' }, { status: 500 });
  }
}
