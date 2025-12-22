/**
 * AI Provider Factory
 *
 * Creates and manages AI provider instances
 */

import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import type { AIProvider, AIModel } from './types';

export function createAIProvider(model: AIModel): AIProvider {
  switch (model) {
    case 'claude-sonnet-4':
      return new ClaudeProvider();

    case 'gpt-4o':
    case 'gpt-4-turbo':
      return new OpenAIProvider(model);

    case 'gemini-1.5-pro':
    case 'gemini-1.5-flash':
      return new GeminiProvider(model);

    default:
      throw new Error(`Unsupported AI model: ${model}`);
  }
}

export function getAvailableModels(): Array<{
  value: AIModel;
  label: string;
  provider: string;
  pricing: { input: number; output: number };
}> {
  const models: AIModel[] = [
    'claude-sonnet-4',
    'gpt-4o',
    'gpt-4-turbo',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ];

  return models.map((model) => {
    const provider = createAIProvider(model);
    return {
      value: model,
      label: provider.getName(),
      provider: provider.getName(),
      pricing: provider.getPricing(),
    };
  });
}

export function getDefaultModel(): AIModel {
  return 'claude-sonnet-4';
}

// Re-export types
export type { AIProvider, AIModel, AIProviderConfig, AIProviderResponse, StructuredInsight } from './types';

