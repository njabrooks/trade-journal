import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/validation-points
 *
 * Query params:
 * - thesisId (required): UUID of the thesis
 * - thesisType (required): 'macro' | 'asset'
 * - status (optional): Filter by status (e.g., 'recommended', 'active', 'triggered')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const thesisId = searchParams.get('thesisId');
    const thesisType = searchParams.get('thesisType') as 'macro' | 'asset' | null;
    const status = searchParams.get('status');

    if (!thesisId || !thesisType) {
      return NextResponse.json(
        { error: 'thesisId and thesisType are required' },
        { status: 400 }
      );
    }

    if (thesisType !== 'macro' && thesisType !== 'asset') {
      return NextResponse.json(
        { error: 'thesisType must be "macro" or "asset"' },
        { status: 400 }
      );
    }

    // Build query conditions
    const conditions = [
      eq(signals.thesisId, thesisId),
      eq(signals.thesisType, thesisType),
    ];

    if (status) {
      conditions.push(eq(signals.status, status));
    }

    const result = await db
      .select()
      .from(signals)
      .where(and(...conditions))
      .orderBy(signals.createdAt);

    return NextResponse.json({ validationPoints: result });
  } catch (error) {
    console.error('Error fetching signals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}
