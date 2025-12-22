/**
 * AI Research Processing Service
 *
 * Extracts structured insights from research artifacts using configurable AI providers.
 */

import type { ResearchArtifact } from '@/db/schema';
import {
  createResearchInsight,
  createResearchProcessingRun,
  updateResearchProcessingRun,
  updateResearchArtifactStatus,
} from '@/db/queries/research';
import { createAIProvider, getDefaultModel, type AIModel, type StructuredInsight } from './ai-providers';

/**
 * Process a research artifact and extract structured insights using AI
 */
export async function processResearchArtifact(
  artifact: ResearchArtifact,
  model: AIModel = getDefaultModel()
): Promise<string> {
  const provider = createAIProvider(model);
  const modelName = provider.getName();

  const processingRunId = await createResearchProcessingRun({
    researchArtifactId: artifact.id,
    jobType: 'full_process',
    status: 'running',
    aiModel: modelName,
  });

  try {
    // Update artifact status to processing
    await updateResearchArtifactStatus(artifact.id, 'processing');

    // Extract structured insights using AI provider
    const { insight, inputTokens, outputTokens, cost } = await extractInsights(artifact, provider);

    // Create research insight record
    const insightId = await createResearchInsight({
      researchArtifactId: artifact.id,
      summary: insight.summary,
      keyThemes: insight.keyThemes,
      keyClaims: insight.keyClaims,
      supportingEvidence: insight.supportingEvidence,
      counterEvidence: insight.counterEvidence,
      timeHorizon: insight.timeHorizon,
      confidenceLevel: insight.confidenceLevel,
      relevantTickers: insight.relevantTickers,
      structuredBy: 'ai',
      aiModel: modelName,
      aiProcessingCostUsd: cost.toString(),
    });

    // Update processing run with success
    await updateResearchProcessingRun(processingRunId, {
      status: 'completed',
      completedAt: new Date(),
      result: insight,
      tokensUsed: inputTokens + outputTokens,
      processingCostUsd: cost.toString(),
    });

    // Update artifact status to structured
    await updateResearchArtifactStatus(artifact.id, 'structured');

    return insightId;
  } catch (error) {
    // Update processing run with error
    await updateResearchProcessingRun(processingRunId, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    // Update artifact status to error
    await updateResearchArtifactStatus(
      artifact.id,
      'error',
      error instanceof Error ? error.message : 'Unknown error'
    );

    throw error;
  }
}

/**
 * Extract structured insights from research content using AI provider
 */
async function extractInsights(
  artifact: ResearchArtifact,
  provider: ReturnType<typeof createAIProvider>
): Promise<{
  insight: StructuredInsight;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}> {
  // Get prompt from database (with fallback to default if not found)
  const { getRenderedPrompt } = await import('@/lib/services/prompt-manager');
  
  let prompt: string;
  try {
    prompt = await getRenderedPrompt('insight_extraction', { artifact });
  } catch (error) {
    // Fallback to hardcoded prompt if no prompt found in database
    console.warn('No active prompt found, using fallback prompt:', error);
    prompt = `You are an expert investment research analyst. Analyze the following research content and extract structured insights.

Research Title: ${artifact.title}
Source Type: ${artifact.sourceType}
Author: ${artifact.author || 'Unknown'}
Published: ${artifact.publishedDate || 'Unknown'}

Content:
${artifact.rawContent}

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
  }

  // Process prompt using AI provider
  const response = await provider.process(prompt, { maxTokens: 4096 });
  const responseText = response.content;
  const inputTokens = response.inputTokens;
  const outputTokens = response.outputTokens;
  const cost = provider.calculateCost(inputTokens, outputTokens);

  // Try to parse JSON from response (handle code blocks)
  let jsonText = responseText;
  const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
  } else {
    // Try to find JSON object
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonText = objectMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonText) as StructuredInsight;

    // Validate and sanitize
    const insight: StructuredInsight = {
      summary: parsed.summary || 'No summary generated',
      keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes.slice(0, 10) : [],
      keyClaims: Array.isArray(parsed.keyClaims) ? parsed.keyClaims.slice(0, 20) : [],
      supportingEvidence: Array.isArray(parsed.supportingEvidence)
        ? parsed.supportingEvidence.slice(0, 20)
        : [],
      counterEvidence: Array.isArray(parsed.counterEvidence)
        ? parsed.counterEvidence.slice(0, 20)
        : [],
      timeHorizon: ['long_term', 'medium_term', 'short_term', 'unknown'].includes(
        parsed.timeHorizon
      )
        ? parsed.timeHorizon
        : 'unknown',
      confidenceLevel: ['high', 'medium', 'low', 'exploratory'].includes(
        parsed.confidenceLevel
      )
        ? parsed.confidenceLevel
        : 'medium',
      relevantTickers: Array.isArray(parsed.relevantTickers)
        ? parsed.relevantTickers
            .slice(0, 20)
            .map((t) => t.toUpperCase())
            .filter((t) => /^[A-Z]{1,5}$/.test(t))
        : [],
    };

    return { insight, inputTokens, outputTokens, cost };
  } catch (error) {
    console.error('Failed to parse AI response as JSON:', error);
    console.error('Response text:', responseText);
    throw new Error('Failed to parse AI response. Response was not valid JSON.');
  }
}


/**
 * Batch process multiple artifacts
 */
export async function batchProcessArtifacts(
  artifactIds: string[],
  model: AIModel = getDefaultModel()
): Promise<{
  successful: string[];
  failed: Array<{ id: string; error: string }>;
}> {
  const successful: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  // Import here to avoid circular dependencies
  const { getResearchArtifactById } = await import('@/db/queries/research');

  for (const artifactId of artifactIds) {
    try {
      const artifact = await getResearchArtifactById(artifactId);
      if (!artifact) {
        failed.push({ id: artifactId, error: 'Artifact not found' });
        continue;
      }

      await processResearchArtifact(artifact, model);
      successful.push(artifactId);
    } catch (error) {
      failed.push({
        id: artifactId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { successful, failed };
}
