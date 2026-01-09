import { NextRequest, NextResponse } from 'next/server';
import { getAssetThesisById } from '@/db/queries/assetTheses';
import { getNewsItemsForThesis, getNewsItemCountForThesis } from '@/db/queries/thesisNewsItems';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: thesisId } = await params;

    // Verify thesis exists
    const thesis = await getAssetThesisById(thesisId);
    if (!thesis) {
      return NextResponse.json({ error: 'Asset thesis not found' }, { status: 404 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const includeTriage = searchParams.get('includeTriage') !== 'false';

    // Get news items
    const newsItems = await getNewsItemsForThesis(thesisId, 'asset', {
      limit,
      includeTriage,
    });

    // Get total count for pagination info
    const totalCount = await getNewsItemCountForThesis(thesisId, 'asset');

    return NextResponse.json({
      thesisId,
      thesisType: 'asset',
      thesisTitle: thesis.title,
      ticker: thesis.underlying?.ticker || null,
      newsItems,
      totalCount,
      returnedCount: newsItems.length,
    });
  } catch (error) {
    console.error('Error fetching asset thesis news:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch asset thesis news',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
