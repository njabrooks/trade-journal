import { NextRequest, NextResponse } from 'next/server';
import { getMainClaimsForArtifact, getResearchArtifactById } from '@/db/queries/research';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check artifact exists
    const artifact = await getResearchArtifactById(id);
    if (!artifact) {
      return NextResponse.json({ error: 'Research artifact not found' }, { status: 404 });
    }

    const claimsWithSources = await getMainClaimsForArtifact(id);

    return NextResponse.json({ claims: claimsWithSources });
  } catch (error) {
    console.error('Error fetching claims for artifact:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch claims',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
