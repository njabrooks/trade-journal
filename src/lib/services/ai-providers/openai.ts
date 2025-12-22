/**
 * OpenAI ChatGPT Provider
 */

import OpenAI from 'openai';
import type { AIProvider, AIProviderConfig, AIProviderResponse } from './types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL_MAP: Record<string, string> = {
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-4o-2024-11-20': 'gpt-4o-2024-11-20', // Latest GPT-4o snapshot
};

export class OpenAIProvider implements AIProvider {
  private model: string;

  constructor(model: string = 'gpt-4o') {
    this.model = model;
  }

  getModel(): 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-4o-2024-11-20' {
    return this.model as 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-4o-2024-11-20';
  }

  getName(): string {
    return `OpenAI ${this.model}`;
  }

  getPricing(): { input: number; output: number } {
    // OpenAI pricing (as of Dec 2024/2025)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o': {
        input: 2.5 / 1_000_000, // $2.50 per million input tokens
        output: 10.0 / 1_000_000, // $10 per million output tokens
      },
      'gpt-4o-mini': {
        input: 0.15 / 1_000_000, // $0.15 per million input tokens
        output: 0.6 / 1_000_000, // $0.60 per million output tokens
      },
      'gpt-4o-2024-11-20': {
        input: 2.5 / 1_000_000, // $2.50 per million input tokens
        output: 10.0 / 1_000_000, // $10 per million output tokens
      },
      'gpt-4-turbo': {
        input: 10.0 / 1_000_000, // $10 per million input tokens
        output: 30.0 / 1_000_000, // $30 per million output tokens
      },
    };

    return pricing[this.model] || pricing['gpt-4o'];
  }

  async process(
    prompt: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AIProviderResponse> {
    const maxTokens = config?.maxTokens || 4096;
    const temperature = config?.temperature || 0.7;

    const completion = await openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: maxTokens,
      temperature,
    });

    const responseText = completion.choices[0]?.message?.content || '';
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;

    return {
      content: responseText,
      inputTokens,
      outputTokens,
      model: this.model,
    };
  }

  estimateTokens(text: string): number {
    // GPT models typically use ~4 characters per token (similar to Claude)
    return Math.ceil(text.length / 4);
  }

  calculateCost(inputTokens: number, outputTokens: number): number {
    const pricing = this.getPricing();
    return inputTokens * pricing.input + outputTokens * pricing.output;
  }
}

