/**
 * Claim-Thesis Suggestion Service
 *
 * Generates AI-powered suggestions for linking claims to existing theses.
 * Operates at the claim level (vs ai-hierarchy-analysis.ts which is insight-level).
 * Makes one batched AI call per insight for cost efficiency.
 */

import {
  createResearchHierarchyRecommendation,
  createResearchProcessingRun,
  updateResearchProcessingRun,
} from '@/db/queries/research';
import { getMacroThesesList } from '@/db/queries/macroTheses';
import { getAssetThesesList } from '@/db/queries/assetTheses';
import { db } from '@/db';
import { mainClaims } from '@/db/schema';
import { inArray, eq } from 'drizzle-orm';
import { createAIProvider, getDefaultModel, type AIModel } from './ai-providers';

interface ClaimForSuggestion {
  id: string;
  title: string;
  claim: string;
  category: string;
  qualifier: string | null;
  relevantTickers: string[];
  evidence: string[] | null;
}

interface ParsedSuggestion {
  claim_id: string;
  existing_thesis_id?: string | null;
  existing_asset_thesis_id?: string | null;
  thesis_title: string;
  mapping_type: 'supports' | 'refutes' | 'foundation';
  confidence_score: number;
  reasoning: string;
}

/**
 * Generate thesis linkage suggestions for a batch of claims.
 *
 * @param insightId - The research insight these claims came from (for provenance)
 * @param claimIds - Specific claim IDs to generate suggestions for
 * @param model - AI model to use (defaults to Claude Sonnet 4)
 * @returns Array of recommendation IDs created
 */
export async function generateClaimThesisSuggestions(
  insightId: string,
  claimIds: string[],
  model: AIModel = getDefaultModel()
): Promise<string[]> {
  if (claimIds.length === 0) return [];

  const provider = createAIProvider(model);
  const modelName = provider.getName();

  // Fetch claims to analyze
  const claimsData = await db
    .select({
      id: mainClaims.id,
      title: mainClaims.title,
      claim: mainClaims.claim,
      category: mainClaims.category,
      qualifier: mainClaims.qualifier,
      relevantTickers: mainClaims.relevantTickers,
      evidence: mainClaims.evidence,
    })
    .from(mainClaims)
    .where(inArray(mainClaims.id, claimIds));

  if (claimsData.length === 0) return [];

  // Fetch theses in developing phase (B5: exclude monitoring-phase theses)
  // Only suggest claim links for theses still accumulating evidence.
  // Monitoring-phase theses route new intelligence to signals, not claims.
  const allMacroTheses = await getMacroThesesList();
  const allAssetTheses = await getAssetThesesList();

  const developingStatuses = new Set(['draft', 'developing']);
  const activeMacroTheses = allMacroTheses.filter((t) => developingStatuses.has(t.status));
  const activeAssetTheses = allAssetTheses.filter((v) => developingStatuses.has(v.status));

  // Short-circuit if nothing to suggest against
  if (activeMacroTheses.length === 0 && activeAssetTheses.length === 0) {
    console.log('No developing-phase theses found — skipping suggestion generation');
    return [];
  }

  // Find the artifact ID for the processing run (via insight)
  const { researchInsights } = await import('@/db/schema');
  const [insight] = await db
    .select({ artifactId: researchInsights.researchArtifactId })
    .from(researchInsights)
    .where(eq(researchInsights.id, insightId))
    .limit(1);

  if (!insight) {
    console.warn(`Insight ${insightId} not found — skipping suggestions`);
    return [];
  }

  const processingRunId = await createResearchProcessingRun({
    researchArtifactId: insight.artifactId,
    jobType: 'claim_thesis_suggestions',
    status: 'running',
    aiModel: modelName,
  });

  try {
    const prompt = buildSuggestionPrompt(
      claimsData as ClaimForSuggestion[],
      activeMacroTheses,
      activeAssetTheses
    );

    const response = await provider.process(prompt, { maxTokens: 4096 });
    const suggestions = parseSuggestions(response.content, claimIds);

    // Validate thesis IDs exist
    const validThesisIds = new Set(activeMacroTheses.map((t) => t.id));
    const validAssetThesisIds = new Set(activeAssetTheses.map((v) => v.id));
    const validClaimIds = new Set(claimIds);

    const validSuggestions = suggestions.filter((s) => {
      if (!validClaimIds.has(s.claim_id)) return false;
      if (s.existing_thesis_id && !validThesisIds.has(s.existing_thesis_id)) return false;
      if (s.existing_asset_thesis_id && !validAssetThesisIds.has(s.existing_asset_thesis_id))
        return false;
      if (!s.existing_thesis_id && !s.existing_asset_thesis_id) return false;
      return true;
    });

    // Enforce max 3 suggestions per claim
    const countByClaimId = new Map<string, number>();
    const limitedSuggestions = validSuggestions.filter((s) => {
      const count = countByClaimId.get(s.claim_id) || 0;
      if (count >= 3) return false;
      countByClaimId.set(s.claim_id, count + 1);
      return true;
    });

    // Save to database
    const recommendationIds: string[] = [];
    for (const suggestion of limitedSuggestions) {
      const recId = await createResearchHierarchyRecommendation({
        researchInsightId: insightId,
        mainClaimId: suggestion.claim_id,
        recommendationType: 'link_existing',
        existingThesisId: suggestion.existing_thesis_id || null,
        existingAssetThesisId: suggestion.existing_asset_thesis_id || null,
        mappingType: suggestion.mapping_type,
        confidenceScore: Math.max(0, Math.min(1, suggestion.confidence_score)).toFixed(2),
        reasoning: suggestion.reasoning,
        status: 'pending',
        aiModel: modelName,
        generatedAt: new Date(),
      });
      recommendationIds.push(recId);
    }

    // Update processing run
    const totalCost = provider.calculateCost(response.inputTokens, response.outputTokens);
    await updateResearchProcessingRun(processingRunId, {
      status: 'completed',
      completedAt: new Date(),
      result: {
        suggestionsGenerated: limitedSuggestions.length,
        claimsAnalyzed: claimsData.length,
        thesesConsidered: activeMacroTheses.length + activeAssetTheses.length,
      },
      tokensUsed: response.inputTokens + response.outputTokens,
      processingCostUsd: totalCost.toString(),
    });

    console.log(
      `Generated ${recommendationIds.length} suggestions for ${claimsData.length} claims`
    );
    return recommendationIds;
  } catch (error) {
    await updateResearchProcessingRun(processingRunId, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

function buildSuggestionPrompt(
  claims: ClaimForSuggestion[],
  macroTheses: Array<{
    id: string;
    title: string;
    description: string | null;
    thesisType: string;
    direction: string | null;
    sectors: string[] | null;
    status: string;
  }>,
  assetTheses: Array<{
    id: string;
    title: string;
    description: string | null;
    ticker: string | null;
    direction: string | null;
    status: string;
  }>
): string {
  const claimsJson = claims.map((c) => ({
    id: c.id,
    title: c.title,
    claim: c.claim,
    category: c.category,
    qualifier: c.qualifier,
    tickers: c.relevantTickers,
    evidence: c.evidence?.slice(0, 3), // Limit evidence for token efficiency
  }));

  const thesesJson = macroTheses.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description?.substring(0, 200),
    thesis_type: t.thesisType,
    direction: t.direction,
    sectors: t.sectors,
  }));

  const viewsJson = assetTheses.map((v) => ({
    id: v.id,
    title: v.title,
    description: v.description?.substring(0, 200),
    ticker: v.ticker,
    direction: v.direction,
  }));

  return `You are an investment research analyst. Your task is to suggest which existing theses each claim should be linked to.

For each claim below, suggest up to 3 existing theses it could be linked to. Only suggest links where there is meaningful relevance. Consider:
- Category alignment (macro claims → macro theses, asset-specific claims → asset theses)
- Ticker overlap (claim tickers vs thesis tickers)
- Directional alignment or explicit contradiction
- Thematic/conceptual relevance (same market dynamics, same sector forces)

CLAIMS TO ANALYZE:
${JSON.stringify(claimsJson, null, 2)}

EXISTING MACRO THESES:
${JSON.stringify(thesesJson, null, 2)}

EXISTING ASSET THESES:
${JSON.stringify(viewsJson, null, 2)}

Return a JSON array of suggestions. Each suggestion MUST have these exact fields:
{
  "claim_id": "<uuid of the claim>",
  "existing_thesis_id": "<uuid of macro thesis>" or null,
  "existing_asset_thesis_id": "<uuid of asset thesis>" or null,
  "thesis_title": "<title for display>",
  "mapping_type": "supports" | "refutes" | "foundation",
  "confidence_score": <number 0.0-1.0>,
  "reasoning": "<brief 1-2 sentence explanation>"
}

Rules:
- Max 3 suggestions per claim
- Only suggest if confidence >= 0.4
- Set exactly ONE of existing_thesis_id or existing_asset_thesis_id (not both)
- Use "supports" when the claim provides evidence for the thesis
- Use "refutes" when the claim contradicts or challenges the thesis
- Use "foundation" when the claim is a foundational assumption of the thesis
- IDs must be exact UUIDs from the lists above

Return ONLY a valid JSON array. No markdown, no explanation outside the JSON.`;
}

function parseSuggestions(responseText: string, validClaimIds: string[]): ParsedSuggestion[] {
  let jsonText = responseText;

  // Extract JSON from code blocks if present
  const jsonMatch = responseText.match(/```(?:json)?\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
  } else {
    const arrayMatch = responseText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonText = arrayMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonText);
    const suggestions = Array.isArray(parsed) ? parsed : [parsed];

    return suggestions
      .map(
        (s: any): ParsedSuggestion => ({
          claim_id: s.claim_id,
          existing_thesis_id: s.existing_thesis_id || null,
          existing_asset_thesis_id: s.existing_asset_thesis_id || null,
          thesis_title: s.thesis_title || '',
          mapping_type: validateMappingType(s.mapping_type),
          confidence_score: Math.max(0, Math.min(1, Number(s.confidence_score) || 0.5)),
          reasoning: s.reasoning || 'No reasoning provided',
        })
      )
      .filter((s) => s.confidence_score >= 0.4 && s.reasoning);
  } catch (error) {
    console.error('Failed to parse claim-thesis suggestions:', error);
    console.error('Response text:', responseText.substring(0, 500));
    return [];
  }
}

function validateMappingType(type: string): 'supports' | 'refutes' | 'foundation' {
  if (['supports', 'refutes', 'foundation'].includes(type)) {
    return type as 'supports' | 'refutes' | 'foundation';
  }
  return 'supports';
}
