/**
 * Seed Default AI Prompts
 *
 * Creates default prompts for insight extraction, hierarchy analysis, and recommendation generation.
 * Run this script after creating the ai_prompts table in the database.
 *
 * Usage: npx tsx scripts/seed-default-prompts.ts
 */

import { createPrompt } from '@/db/queries/prompts';
import type { NewAIPrompt } from '@/db/schema';

const DEFAULT_INSIGHT_EXTRACTION_PROMPT = `You are an expert investment research analyst. Analyze the following research content and extract structured insights.

Research Title: {{artifact.title}}
Source Type: {{artifact.sourceType}}
Author: {{artifact.author}}
Published: {{artifact.publishedDate}}

Content:
{{artifact.rawContent}}

Extract the following information in JSON format:

1. **summary**: A concise 2-3 sentence summary of the main thesis and key findings
2. **keyThemes**: Array of 3-5 main themes or topics covered (e.g., ["AI infrastructure", "GPU demand", "datacenter buildout"])
3. **keyClaims**: Array of key claims made in the research, each with:
   - claim: The specific claim or thesis
   - evidence: Supporting evidence or data mentioned
   - confidence: Your assessment of claim strength (high/medium/low)
4. **supportingEvidence**: Array of evidence points that support the main thesis:
   - point: The evidence point
   - source: Where it came from (data, quote, etc.)
5. **counterEvidence**: Array of counterarguments or risks mentioned:
   - point: The counterargument
   - source: Where it came from
6. **timeHorizon**: Investment time horizon (long_term: >3 years, medium_term: 1-3 years, short_term: <1 year, unknown)
7. **confidenceLevel**: Overall confidence in the research quality (high/medium/low/exploratory)
8. **relevantTickers**: Array of stock tickers mentioned (e.g., ["NVDA", "MSFT", "GOOGL"]). Only include if explicitly mentioned or clearly implied.

Return ONLY valid JSON matching this structure. Be thorough but concise.`;

const DEFAULT_HIERARCHY_ANALYSIS_PROMPT = `You are an expert investment research analyst. Analyze the following research insights and compare them against existing macro theses and asset thesiss.

Research Summary: {{insight.summary}}
Key Themes: {{insight.keyThemes}}
Key Claims: {{insight.keyClaims}}
Relevant Tickers: {{insight.relevantTickers}}

Existing Macro Theses:
{{existingTheses}}

Existing Asset Thesiss:
{{existingViews}}

Analyze whether these insights:
1. Represent a NEW macro thesis (broader market theme)
2. Represent a NEW asset thesis (specific asset/ticker view)
3. Support or refute an EXISTING thesis or view
4. Are exploratory research that doesn't fit cleanly

Return your analysis in JSON format with recommendations.`;

const DEFAULT_RECOMMENDATION_GENERATION_PROMPT = `You are an expert investment research analyst. Based on your hierarchy analysis, generate specific recommendations.

Research Insights:
{{insight.summary}}

Existing Hierarchy:
- Theses: {{existingTheses}}
- Views: {{existingViews}}

Generate recommendations for:
1. Creating new macro theses (if insights represent new macro themes)
2. Creating new asset thesiss (if insights represent new asset-specific views)
3. Linking to existing items (with confidence scores and evidence type)

Return recommendations in JSON format with:
- recommendation_type: 'new_macro_thesis' | 'new_asset_view' | 'link_existing' | 'refute_existing'
- proposed_title, proposed_description (for new items)
- existing_item_id (for linking)
- confidence_score: 0.0 to 1.0
- reasoning: Why this recommendation`;

async function seedDefaultPrompts() {
  console.log('🌱 Seeding default AI prompts...\n');

  try {
    // Check if prompts already exist
    const { getDefaultPrompt } = await import('@/db/queries/prompts');
    const existingInsight = await getDefaultPrompt('insight_extraction');
    const existingHierarchy = await getDefaultPrompt('hierarchy_analysis');
    const existingRecommendation = await getDefaultPrompt('recommendation_generation');

    if (existingInsight || existingHierarchy || existingRecommendation) {
      console.log('⚠️  Default prompts already exist. Skipping seed.');
      console.log('   To re-seed, delete existing default prompts first.\n');
      return;
    }

    // Extract template variables
    const { extractTemplateVariables } = await import('@/lib/services/prompt-manager');

    // Seed Insight Extraction prompt
    const insightVariables = extractTemplateVariables(DEFAULT_INSIGHT_EXTRACTION_PROMPT);
    const insightPrompt: NewAIPrompt = {
      promptType: 'insight_extraction',
      name: 'Default Insight Extraction',
      description: 'Default prompt for extracting structured insights from research content',
      content: DEFAULT_INSIGHT_EXTRACTION_PROMPT,
      variables: insightVariables,
      version: 1,
      parentVersionId: null,
      status: 'active',
      isDefault: true,
      createdBy: null,
    };

    const insightId = await createPrompt(insightPrompt);
    console.log('✅ Created default insight extraction prompt');

    // Seed Hierarchy Analysis prompt
    const hierarchyVariables = extractTemplateVariables(DEFAULT_HIERARCHY_ANALYSIS_PROMPT);
    const hierarchyPrompt: NewAIPrompt = {
      promptType: 'hierarchy_analysis',
      name: 'Default Hierarchy Analysis',
      description: 'Default prompt for analyzing research insights against existing hierarchy',
      content: DEFAULT_HIERARCHY_ANALYSIS_PROMPT,
      variables: hierarchyVariables,
      version: 1,
      parentVersionId: null,
      status: 'active',
      isDefault: true,
      createdBy: null,
    };

    const hierarchyId = await createPrompt(hierarchyPrompt);
    console.log('✅ Created default hierarchy analysis prompt');

    // Seed Recommendation Generation prompt
    const recommendationVariables = extractTemplateVariables(DEFAULT_RECOMMENDATION_GENERATION_PROMPT);
    const recommendationPrompt: NewAIPrompt = {
      promptType: 'recommendation_generation',
      name: 'Default Recommendation Generation',
      description: 'Default prompt for generating hierarchy recommendations from analysis',
      content: DEFAULT_RECOMMENDATION_GENERATION_PROMPT,
      variables: recommendationVariables,
      version: 1,
      parentVersionId: null,
      status: 'active',
      isDefault: true,
      createdBy: null,
    };

    const recommendationId = await createPrompt(recommendationPrompt);
    console.log('✅ Created default recommendation generation prompt');

    console.log('\n🎉 Successfully seeded all default prompts!');
    console.log('\nYou can now:');
    console.log('  - View prompts at /admin/prompts (once UI is built)');
    console.log('  - Edit prompts via API or admin UI');
    console.log('  - Create custom prompts for different use cases');
  } catch (error) {
    console.error('❌ Error seeding default prompts:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedDefaultPrompts()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { seedDefaultPrompts };

