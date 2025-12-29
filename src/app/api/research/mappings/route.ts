import { NextRequest, NextResponse } from 'next/server';
import {
  createResearchMapping,
  getResearchMappingsForInsight,
  getResearchForThesis,
  getResearchForAssetThesis,
  getResearchForStrategy,
} from '@/db/queries/research';
import type { NewResearchMapping } from '@/db/schema';

// GET /api/research/mappings - List mappings by filter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const insightId = searchParams.get('insightId');
    const thesisId = searchParams.get('thesisId');
    const viewId = searchParams.get('viewId');
    const strategyId = searchParams.get('strategyId');

    // List mappings for a specific insight
    if (insightId) {
      const mappings = await getResearchMappingsForInsight(insightId);
      return NextResponse.json({ success: true, mappings });
    }

    // List research for a specific hierarchy item
    if (thesisId) {
      const research = await getResearchForThesis(thesisId);
      return NextResponse.json({ success: true, research });
    }

    if (viewId) {
      const research = await getResearchForAssetThesis(viewId);
      return NextResponse.json({ success: true, research });
    }

    if (strategyId) {
      const research = await getResearchForStrategy(strategyId);
      return NextResponse.json({ success: true, research });
    }

    return NextResponse.json(
      { success: false, error: 'Query parameter required: insightId, thesisId, viewId, or strategyId' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error fetching research mappings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch research mappings' },
      { status: 500 }
    );
  }
}

// POST /api/research/mappings - Create a new mapping
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.researchInsightId) {
      return NextResponse.json(
        { success: false, error: 'researchInsightId is required' },
        { status: 400 }
      );
    }

    if (!body.hierarchyLevel) {
      return NextResponse.json(
        { success: false, error: 'hierarchyLevel is required' },
        { status: 400 }
      );
    }

    if (!body.mappingType) {
      return NextResponse.json(
        { success: false, error: 'mappingType is required' },
        { status: 400 }
      );
    }

    // Validate mapping type
    const validMappingTypes = ['supports', 'refutes', 'neutral', 'exploratory'];
    if (!validMappingTypes.includes(body.mappingType)) {
      return NextResponse.json(
        { success: false, error: `mappingType must be one of: ${validMappingTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate hierarchy level
    const validHierarchyLevels = ['macro_thesis', 'asset_view', 'strategy', 'position'];
    if (!validHierarchyLevels.includes(body.hierarchyLevel)) {
      return NextResponse.json(
        { success: false, error: `hierarchyLevel must be one of: ${validHierarchyLevels.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate that exactly one target ID is provided
    const targetIds = [
      body.macroThesisId,
      body.assetThesisId,
      body.strategyId,
      body.positionId,
    ].filter((id) => id != null);

    if (targetIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'One target ID is required (macroThesisId, assetThesisId, strategyId, or positionId)' },
        { status: 400 }
      );
    }

    if (targetIds.length > 1) {
      return NextResponse.json(
        { success: false, error: 'Only one target ID should be provided' },
        { status: 400 }
      );
    }

    // Prepare mapping data
    const mappingData: NewResearchMapping = {
      researchInsightId: body.researchInsightId,
      hierarchyLevel: body.hierarchyLevel,
      mappingType: body.mappingType,
      mappedBy: body.mappedBy || 'user', // Default to 'user' if not specified
      confidence: body.confidence || null,
      notes: body.notes || null,
      macroThesisId: body.macroThesisId || null,
      assetThesisId: body.assetThesisId || null,
      strategyId: body.strategyId || null,
      positionId: body.positionId || null,
      suggestedByAi: body.suggestedByAi || false,
      aiSuggestionScore: body.aiSuggestionScore || null,
    };

    const mappingId = await createResearchMapping(mappingData);

    return NextResponse.json({
      success: true,
      mappingId,
      message: 'Research mapping created successfully',
    });
  } catch (error) {
    console.error('Error creating research mapping:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create research mapping' },
      { status: 500 }
    );
  }
}
