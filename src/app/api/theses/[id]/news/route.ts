import { NextRequest, NextResponse } from 'next/server';
import { getMacroThesisById } from '@/db/queries/macroTheses';
import { getNewsItemsForThesis, getNewsItemCountForThesis } from '@/db/queries/thesisNewsItems';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: thesisId } = await params;

    // Verify thesis exists
    const thesis = await getMacroThesisById(thesisId);
    if (!thesis) {
      return NextResponse.json({ error: 'Macro thesis not found' }, { status: 404 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const includeTriage = searchParams.get('includeTriage') !== 'false';

    // Get news items
    const newsItems = await getNewsItemsForThesis(thesisId, 'macro', {
      limit,
      includeTriage,
    });

    // Get total count for pagination info
    const totalCount = await getNewsItemCountForThesis(thesisId, 'macro');

    return NextResponse.json({
      thesisId,
      thesisType: 'macro',
      thesisTitle: thesis.title,
      newsItems,
      totalCount,
      returnedCount: newsItems.length,
    });
  } catch (error) {
    console.error('Error fetching thesis news:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch thesis news',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
