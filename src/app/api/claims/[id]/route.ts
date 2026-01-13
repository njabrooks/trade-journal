import { NextRequest, NextResponse } from 'next/server';
import { getMainClaimById } from '@/db/queries/research';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const claim = await getMainClaimById(id);
    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    return NextResponse.json(claim);
  } catch (error) {
    console.error('Error fetching claim:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch claim',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
