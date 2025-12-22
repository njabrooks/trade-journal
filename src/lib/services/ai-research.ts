/**
 * AI Research Processing Service
 *
 * Uses Anthropic Claude to extract structured insights from research artifacts.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ResearchArtifact } from '@/db/schema';
import {
  createResearchInsight,
  createResearchProcessingRun,
  updateResearchProcessingRun,
  updateResearchArtifactStatus,
} from '@/db/queries/research';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Model configuration
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

// Pricing (as of Dec 2024 - update if pricing changes)
const PRICING = {
  'claude-sonnet-4-20250514': {
    input: 3.0 / 1_000_000, // $3 per million input tokens
    output: 15.0 / 1_000_000, // $15 per million output tokens
  },
};

interface StructuredInsight {
  summary: string;
  keyThemes: string[];
  keyClaims: Array<{
    claim: string;
    evidence: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  supportingEvidence: Array<{
    point: string;
    source: string;
  }>;
  counterEvidence: Array<{
    point: string;
    source: string;
  }>;
  timeHorizon: 'long_term' | 'medium_term' | 'short_term' | 'unknown';
  confidenceLevel: 'high' | 'medium' | 'low' | 'exploratory';
  relevantTickers: string[];
}

/**
 * Process a research artifact and extract structured insights using AI
 */
export async function processResearchArtifact(
  artifact: ResearchArtifact
): Promise<string> {
  const processingRunId = await createResearchProcessingRun({
    researchArtifactId: artifact.id,
    jobType: 'full_process',
    status: 'running',
    aiModel: MODEL,
  });

  try {
    // Update artifact status to processing
    await updateResearchArtifactStatus(artifact.id, 'processing');

    // Extract structured insights using Claude
    const insight = await extractInsights(artifact);

    // Calculate cost
    const inputTokens = estimateTokens(artifact.rawContent);
    const outputTokens = estimateTokens(JSON.stringify(insight));
    const cost = calculateCost(MODEL, inputTokens, outputTokens);

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
      aiModel: MODEL,
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
 * Extract structured insights from research content using Claude
 */
async function extractInsights(artifact: ResearchArtifact): Promise<StructuredInsight> {
  const prompt = `You are an expert investment research analyst. Analyze the following research content and extract structured insights.

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

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  // Extract JSON from response
  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

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
    return {
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
  } catch (error) {
    console.error('Failed to parse AI response as JSON:', error);
    console.error('Response text:', responseText);
    throw new Error('Failed to parse AI response. Response was not valid JSON.');
  }
}

/**
 * Estimate token count (rough approximation)
 * Claude typically uses ~4 characters per token
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate processing cost based on model and token usage
 */
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model as keyof typeof PRICING];
  if (!pricing) {
    console.warn(`No pricing info for model ${model}, using default`);
    return 0;
  }

  return inputTokens * pricing.input + outputTokens * pricing.output;
}

/**
 * Batch process multiple artifacts
 */
export async function batchProcessArtifacts(artifactIds: string[]): Promise<{
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

      await processResearchArtifact(artifact);
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
