/**
 * AI Hierarchy Analysis Service
 *
 * Analyzes research insights against existing macro theses and asset views,
 * and generates recommendations for creating new items or linking to existing ones.
 */

import type { ResearchInsight } from '@/db/schema';
import {
  createResearchHierarchyRecommendation,
  createResearchProcessingRun,
  updateResearchProcessingRun,
} from '@/db/queries/research';
import { getMacroThesesList } from '@/db/queries/macroTheses';
import { getAssetViewsList } from '@/db/queries/assetViews';
import { getRenderedPrompt } from '@/lib/services/prompt-manager';
import { createAIProvider, getDefaultModel, type AIModel } from './ai-providers';

interface HierarchyRecommendation {
  recommendation_type: 'new_macro_thesis' | 'new_asset_view' | 'link_existing' | 'refute_existing';
  proposed_title?: string;
  proposed_description?: string;
  proposed_thesis_type?: 'secular' | 'cyclical' | 'structural';
  proposed_time_horizon?: 'long_term' | 'medium_term' | 'short_term';
  proposed_confidence_level?: 'high' | 'medium' | 'low' | 'exploratory';
  proposed_underlying_ticker?: string;
  existing_thesis_id?: string;
  existing_thesis_title?: string;
  existing_view_id?: string;
  existing_view_title?: string;
  mapping_type?: 'supports' | 'refutes' | 'neutral' | 'exploratory';
  confidence_score: number; // 0.0 to 1.0
  reasoning: string;
}

/**
 * Analyze research insight against existing hierarchy and generate recommendations
 */
export async function analyzeHierarchy(
  insight: ResearchInsight,
  model: AIModel = getDefaultModel()
): Promise<string[]> {
  const provider = createAIProvider(model);
  const modelName = provider.getName();

  const processingRunId = await createResearchProcessingRun({
    researchArtifactId: insight.researchArtifactId,
    jobType: 'hierarchy_analysis',
    status: 'running',
    aiModel: modelName,
  });

  try {
    // Fetch existing hierarchy
    const existingTheses = await getMacroThesesList();
    const existingViews = await getAssetViewsList();

    // Prepare theses data for prompt
    const thesesData = existingTheses.map((t) => ({
      id: t.id,
      title: t.title,
      thesisType: t.thesisType,
      description: null, // Not in list view, but we can add if needed
      status: t.status,
    }));

    // Prepare views data for prompt
    const viewsData = existingViews.map((v) => ({
      id: v.id,
      title: v.title,
      ticker: v.ticker,
      narrative: null, // Not in list view, but we can add if needed
      status: v.status,
    }));

    // Get hierarchy analysis prompt
    let analysisPrompt: string;
    try {
      analysisPrompt = await getRenderedPrompt('hierarchy_analysis', {
        insight,
        existingTheses: thesesData,
        existingViews: viewsData,
      });
    } catch (error) {
      console.warn('No hierarchy_analysis prompt found, using fallback:', error);
      analysisPrompt = buildFallbackAnalysisPrompt(insight, thesesData, viewsData);
    }

    // Run hierarchy analysis
    const analysisResponse = await provider.process(analysisPrompt, { maxTokens: 4096 });
    const analysisText = analysisResponse.content;

    // Get recommendation generation prompt
    let recommendationPrompt: string;
    try {
      recommendationPrompt = await getRenderedPrompt('recommendation_generation', {
        insight,
        existingTheses: thesesData,
        existingViews: viewsData,
      });
    } catch (error) {
      console.warn('No recommendation_generation prompt found, using fallback:', error);
      recommendationPrompt = buildFallbackRecommendationPrompt(insight, thesesData, viewsData);
    }

    // Generate recommendations
    const recommendationResponse = await provider.process(recommendationPrompt, {
      maxTokens: 4096,
    });
    const recommendationText = recommendationResponse.content;

    // Parse recommendations JSON
    let recommendations: HierarchyRecommendation[];
    try {
      recommendations = parseRecommendations(recommendationText);
      console.log('Parsed recommendations:', JSON.stringify(recommendations, null, 2));
    } catch (parseError) {
      console.error('Failed to parse recommendations:', parseError);
      console.error('Recommendation text:', recommendationText);
      // Don't throw - return empty array so processing completes
      recommendations = [];
    }

    // Calculate total cost
    const totalInputTokens =
      analysisResponse.inputTokens + recommendationResponse.inputTokens;
    const totalOutputTokens =
      analysisResponse.outputTokens + recommendationResponse.outputTokens;
    const totalCost = provider.calculateCost(totalInputTokens, totalOutputTokens);

    // Save recommendations to database
    const recommendationIds: string[] = [];
    for (const rec of recommendations) {
      // Validate recommendation has at least some useful data
      const hasProposedData = rec.proposed_title || rec.proposed_description;
      const hasExistingLink = rec.existing_thesis_id || rec.existing_view_id;
      const hasValidReasoning = rec.reasoning && rec.reasoning !== 'No reasoning provided';

      if (!hasProposedData && !hasExistingLink && !hasValidReasoning) {
        console.warn('Skipping invalid recommendation:', rec);
        continue;
      }

      const recId = await createResearchHierarchyRecommendation({
        researchInsightId: insight.id,
        recommendationType: rec.recommendation_type,
        proposedData: {
          title: rec.proposed_title,
          description: rec.proposed_description,
          thesisType: rec.proposed_thesis_type,
          timeHorizon: rec.proposed_time_horizon,
          confidenceLevel: rec.proposed_confidence_level,
          underlyingTicker: rec.proposed_underlying_ticker,
        },
        existingThesisId: rec.existing_thesis_id || null,
        existingViewId: rec.existing_view_id || null,
        mappingType: rec.mapping_type || null,
        confidenceScore: rec.confidence_score.toString(),
        reasoning: rec.reasoning,
        status: 'pending',
        aiModel: modelName,
        generatedAt: new Date(),
      });
      recommendationIds.push(recId);
    }

    // Update processing run with success
    await updateResearchProcessingRun(processingRunId, {
      status: 'completed',
      completedAt: new Date(),
      result: {
        recommendations: recommendations,
        analysis: analysisText,
      },
      tokensUsed: totalInputTokens + totalOutputTokens,
      processingCostUsd: totalCost.toString(),
    });

    return recommendationIds;
  } catch (error) {
    // Update processing run with error
    await updateResearchProcessingRun(processingRunId, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Parse recommendations from AI response
 */
function parseRecommendations(responseText: string): HierarchyRecommendation[] {
  console.log('=== Parsing Recommendations ===');
  console.log('Response length:', responseText.length);
  console.log('First 1000 chars:', responseText.substring(0, 1000));
  
  // Try to extract JSON from response
  let jsonText = responseText;
  const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
    console.log('Extracted JSON from code block');
  } else {
    // Try to find JSON array or object
    const arrayMatch = responseText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonText = arrayMatch[0];
      console.log('Extracted JSON array');
    } else {
      const objectMatch = responseText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonText = objectMatch[0];
        console.log('Extracted JSON object');
      } else {
        console.warn('No JSON structure found in response');
        console.warn('Full response:', responseText);
      }
    }
  }

  try {
    const parsed = JSON.parse(jsonText);
    console.log('Successfully parsed JSON, type:', Array.isArray(parsed) ? 'array' : typeof parsed);

    // Handle both array and single object
    const recommendations = Array.isArray(parsed) ? parsed : [parsed];
    console.log('Number of recommendations before filtering:', recommendations.length);

    // Validate and sanitize
    return recommendations
      .map((rec: any) => ({
        recommendation_type: rec.recommendation_type || 'link_existing',
        proposed_title: rec.proposed_title,
        proposed_description: rec.proposed_description,
        proposed_thesis_type: rec.proposed_thesis_type,
        proposed_time_horizon: rec.proposed_time_horizon,
        proposed_confidence_level: rec.proposed_confidence_level,
        proposed_underlying_ticker: rec.proposed_underlying_ticker,
        existing_thesis_id: rec.existing_thesis_id,
        existing_thesis_title: rec.existing_thesis_title,
        existing_view_id: rec.existing_view_id,
        existing_view_title: rec.existing_view_title,
        mapping_type: rec.mapping_type || 'supports',
        confidence_score: Math.max(0, Math.min(1, rec.confidence_score || 0.5)),
        reasoning: rec.reasoning || 'No reasoning provided',
      }))
      .filter((rec: HierarchyRecommendation) => rec.reasoning);
    
    console.log('Number of recommendations after filtering:', recommendations.length);
    console.log('Final recommendations:', JSON.stringify(recommendations, null, 2));
    return recommendations;
  } catch (error) {
    console.error('Failed to parse recommendations:', error);
    console.error('JSON text attempted:', jsonText.substring(0, 500));
    console.error('Full response text:', responseText);
    throw new Error('Failed to parse AI recommendations. Response was not valid JSON.');
  }
}

/**
 * Build fallback hierarchy analysis prompt
 */
function buildFallbackAnalysisPrompt(
  insight: ResearchInsight,
  theses: Array<{ id: string; title: string; thesisType: string; status: string }>,
  views: Array<{ id: string; title: string; ticker: string | null; status: string }>
): string {
  return `You are an expert investment research analyst. Analyze the following research insights and compare them against existing macro theses and asset views.

Research Summary: ${insight.summary}
Key Themes: ${JSON.stringify(insight.keyThemes || [])}
Key Claims: ${JSON.stringify(insight.keyClaims || [])}
Relevant Tickers: ${JSON.stringify(insight.relevantTickers || [])}

Existing Macro Theses:
${JSON.stringify(theses, null, 2)}

Existing Asset Views:
${JSON.stringify(views, null, 2)}

Analyze whether these insights:
1. Represent a NEW macro thesis (broader market theme)
2. Represent a NEW asset view (specific asset/ticker view)
3. Support or refute an EXISTING thesis or view
4. Are exploratory research that doesn't fit cleanly

Return your analysis in JSON format with recommendations.`;
}

/**
 * Build fallback recommendation generation prompt
 */
function buildFallbackRecommendationPrompt(
  insight: ResearchInsight,
  theses: Array<{ id: string; title: string; thesisType: string; status: string }>,
  views: Array<{ id: string; title: string; ticker: string | null; status: string }>
): string {
  return `You are an expert investment research analyst. Based on your hierarchy analysis, generate specific recommendations.

Research Insights:
${insight.summary}

Existing Hierarchy:
- Theses: ${JSON.stringify(theses, null, 2)}
- Views: ${JSON.stringify(views, null, 2)}

Generate recommendations for:
1. Creating new macro theses (if insights represent new macro themes)
2. Creating new asset views (if insights represent new asset-specific views)
3. Linking to existing items (with confidence scores and evidence type)

Return recommendations in JSON array format, each with:
- recommendation_type: 'new_macro_thesis' | 'new_asset_view' | 'link_existing' | 'refute_existing'
- proposed_title, proposed_description (for new items)
- existing_thesis_id or existing_view_id (for linking)
- confidence_score: 0.0 to 1.0
- reasoning: Why this recommendation
- mapping_type: 'supports' | 'refutes' | 'neutral' | 'exploratory' (for linking)

Be specific and actionable. Return ONLY valid JSON array.`;
}

