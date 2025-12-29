import { NextRequest, NextResponse } from 'next/server';
import { promoteMainClaim } from '@/db/queries/research';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { claimId } = body;

    if (!claimId || typeof claimId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid claimId provided' },
        { status: 400 }
      );
    }

    await promoteMainClaim(claimId);

    return NextResponse.json(
      { success: true, message: 'Claim promoted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error promoting claim:', error);
    return NextResponse.json(
      { error: 'Failed to promote claim', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
