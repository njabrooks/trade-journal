/**
 * AI Provider Factory
 *
 * Creates and manages AI provider instances.
 * Claude interactions use spawned agent workflows (Claude CLI / Claude Max),
 * not direct API calls. Only OpenAI and Gemini use API key providers.
 */

import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import type { AIProvider, AIModel } from './types';

export function createAIProvider(model: AIModel): AIProvider {
  switch (model) {
    case 'gpt-4o':
    case 'gpt-4o-mini':
    case 'gpt-4-turbo':
    case 'gpt-4o-2024-11-20':
      return new OpenAIProvider(model);

    case 'gemini-1.5-pro':
    case 'gemini-1.5-flash':
    case 'gemini-2.0-flash-exp':
    case 'gemini-pro':
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
    // OpenAI models
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4o-2024-11-20',
    'gpt-4-turbo',
    // Gemini models
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-2.0-flash-exp',
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
  return 'gpt-4o';
}

// Re-export types
export type { AIProvider, AIModel, AIProviderConfig, AIProviderResponse, StructuredInsight } from './types';
