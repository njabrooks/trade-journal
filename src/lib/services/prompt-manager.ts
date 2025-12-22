/**
 * Prompt Manager Service
 *
 * Handles fetching and rendering AI prompts with template variable replacement.
 */

import { getActivePrompt, incrementPromptUsage, type PromptType } from '@/db/queries/prompts';
import type { ResearchArtifact, ResearchInsight } from '@/db/schema';

interface PromptContext {
  artifact?: ResearchArtifact;
  insight?: ResearchInsight;
  existingTheses?: Array<{ id: string; title: string; description: string | null }>;
  existingViews?: Array<{ id: string; title: string; narrative: string | null; ticker: string | null }>;
  [key: string]: any; // Allow additional context
}

/**
 * Render a prompt template by replacing template variables with actual values
 */
export function renderPrompt(template: string, context: PromptContext): string {
  let rendered = template;

  // Replace artifact variables
  if (context.artifact) {
    rendered = rendered.replace(/\{\{artifact\.title\}\}/g, context.artifact.title || '');
    rendered = rendered.replace(/\{\{artifact\.sourceType\}\}/g, context.artifact.sourceType || '');
    rendered = rendered.replace(/\{\{artifact\.author\}\}/g, context.artifact.author || 'Unknown');
    rendered = rendered.replace(
      /\{\{artifact\.publishedDate\}\}/g,
      context.artifact.publishedDate || 'Unknown'
    );
    rendered = rendered.replace(/\{\{artifact\.rawContent\}\}/g, context.artifact.rawContent || '');
  }

  // Replace insight variables
  if (context.insight) {
    rendered = rendered.replace(/\{\{insight\.summary\}\}/g, context.insight.summary || '');
    rendered = rendered.replace(
      /\{\{insight\.keyThemes\}\}/g,
      JSON.stringify(context.insight.keyThemes || [])
    );
    rendered = rendered.replace(
      /\{\{insight\.keyClaims\}\}/g,
      JSON.stringify(context.insight.keyClaims || [])
    );
    rendered = rendered.replace(
      /\{\{insight\.relevantTickers\}\}/g,
      JSON.stringify(context.insight.relevantTickers || [])
    );
  }

  // Replace existing theses
  if (context.existingTheses) {
    const thesesJson = JSON.stringify(
      context.existingTheses.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
      null,
      2
    );
    rendered = rendered.replace(/\{\{existingTheses\}\}/g, thesesJson);
  }

  // Replace existing views
  if (context.existingViews) {
    const viewsJson = JSON.stringify(
      context.existingViews.map((v) => ({
        id: v.id,
        title: v.title,
        narrative: v.narrative,
        ticker: v.ticker,
      })),
      null,
      2
    );
    rendered = rendered.replace(/\{\{existingViews\}\}/g, viewsJson);
  }

  // Replace any other custom variables
  Object.keys(context).forEach((key) => {
    if (key !== 'artifact' && key !== 'insight' && key !== 'existingTheses' && key !== 'existingViews') {
      const value = context[key];
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(regex, String(value || ''));
    }
  });

  return rendered;
}

/**
 * Get and render an active prompt for a specific type
 */
export async function getRenderedPrompt(
  promptType: PromptType,
  context: PromptContext
): Promise<string> {
  const prompt = await getActivePrompt(promptType);

  if (!prompt) {
    throw new Error(
      `No active prompt found for type: ${promptType}. Please create a default prompt.`
    );
  }

  // Increment usage count (fire and forget)
  incrementPromptUsage(prompt.id).catch(console.error);

  return renderPrompt(prompt.content, context);
}

/**
 * Get prompt content without rendering (for editing/preview)
 */
export async function getPromptContent(promptType: PromptType): Promise<string | null> {
  const prompt = await getActivePrompt(promptType);
  return prompt?.content ?? null;
}

/**
 * Extract template variables from a prompt template
 */
export function extractTemplateVariables(template: string): string[] {
  const regex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
  const matches = template.matchAll(regex);
  const variables = new Set<string>();

  for (const match of matches) {
    variables.add(match[1]);
  }

  return Array.from(variables).sort();
}

