import { NextRequest, NextResponse } from 'next/server';
import { addRelatedMacroThesis, getRelatedMacroThesesForAssetThesis } from '@/db/queries/relatedMacroTheses';

/**
 * POST /api/asset-theses/[id]/related-macro-theses
 * Add a related macro thesis to an asset thesis
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assetThesisId } = await params;
    const body = await request.json();
    const { macroThesisId, relationshipNote } = body;

    if (!macroThesisId) {
      return NextResponse.json(
        { error: 'Missing required field: macroThesisId' },
        { status: 400 }
      );
    }

    const result = await addRelatedMacroThesis(
      assetThesisId,
      macroThesisId,
      relationshipNote || null,
      'user' // TODO: Add actual user tracking
    );

    return NextResponse.json({
      success: true,
      relation: result,
      message: 'Related macro thesis added successfully',
    });
  } catch (error: any) {
    console.error('Error adding related macro thesis:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This macro thesis is already linked as a related thesis' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add related macro thesis', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/asset-theses/[id]/related-macro-theses
 * Get all related macro theses for an asset thesis
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assetThesisId } = await params;
    
    const relatedTheses = await getRelatedMacroThesesForAssetThesis(assetThesisId);

    return NextResponse.json(relatedTheses);
  } catch (error: any) {
    console.error('Error fetching related macro theses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch related macro theses', details: error.message },
      { status: 500 }
    );
  }
}

