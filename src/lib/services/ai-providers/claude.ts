/**
 * Anthropic Claude AI Provider
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIProviderConfig, AIProviderResponse } from './types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4': 'claude-sonnet-4-20250514',
};

export class ClaudeProvider implements AIProvider {
  private model: string;

  constructor(model: string = 'claude-sonnet-4-20250514') {
    this.model = model;
  }

  getModel(): 'claude-sonnet-4' {
    return 'claude-sonnet-4';
  }

  getName(): string {
    return 'Anthropic Claude Sonnet 4';
  }

  getPricing(): { input: number; output: number } {
    // Claude Sonnet 4 pricing (as of Dec 2024)
    return {
      input: 3.0 / 1_000_000, // $3 per million input tokens
      output: 15.0 / 1_000_000, // $15 per million output tokens
    };
  }

  async process(
    prompt: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AIProviderResponse> {
    const maxTokens = config?.maxTokens || 4096;

    const message = await anthropic.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;

    return {
      content: responseText,
      inputTokens,
      outputTokens,
      model: this.model,
    };
  }

  estimateTokens(text: string): number {
    // Claude typically uses ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  calculateCost(inputTokens: number, outputTokens: number): number {
    const pricing = this.getPricing();
    return inputTokens * pricing.input + outputTokens * pricing.output;
  }
}

