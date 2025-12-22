/**
 * Google Gemini Provider
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AIProviderConfig, AIProviderResponse } from './types';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

const MODEL_MAP: Record<string, string> = {
  'gemini-1.5-pro': 'gemini-1.5-pro',
  'gemini-1.5-flash': 'gemini-1.5-flash',
};

export class GeminiProvider implements AIProvider {
  private model: string;

  constructor(model: string = 'gemini-1.5-pro') {
    this.model = model;
  }

  getModel(): 'gemini-1.5-pro' | 'gemini-1.5-flash' {
    return this.model as 'gemini-1.5-pro' | 'gemini-1.5-flash';
  }

  getName(): string {
    return `Google ${this.model}`;
  }

  getPricing(): { input: number; output: number } {
    // Gemini pricing (as of Dec 2024)
    const pricing: Record<string, { input: number; output: number }> = {
      'gemini-1.5-pro': {
        input: 1.25 / 1_000_000, // $1.25 per million input tokens
        output: 5.0 / 1_000_000, // $5 per million output tokens
      },
      'gemini-1.5-flash': {
        input: 0.075 / 1_000_000, // $0.075 per million input tokens
        output: 0.3 / 1_000_000, // $0.30 per million output tokens
      },
    };

    return pricing[this.model] || pricing['gemini-1.5-pro'];
  }

  async process(
    prompt: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AIProviderResponse> {
    const model = genAI.getGenerativeModel({ model: this.model });
    const temperature = config?.temperature || 0.7;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: config?.maxTokens || 4096,
      },
    });

    const response = await result.response;
    const responseText = response.text();
    
    // Gemini provides token counts via usageMetadata
    const usageMetadata = response.usageMetadata;
    const inputTokens = usageMetadata?.promptTokenCount || this.estimateTokens(prompt);
    const outputTokens = usageMetadata?.candidatesTokenCount || this.estimateTokens(responseText);

    return {
      content: responseText,
      inputTokens,
      outputTokens,
      model: this.model,
    };
  }

  estimateTokens(text: string): number {
    // Gemini typically uses ~4 characters per token (similar to other models)
    return Math.ceil(text.length / 4);
  }

  calculateCost(inputTokens: number, outputTokens: number): number {
    const pricing = this.getPricing();
    return inputTokens * pricing.input + outputTokens * pricing.output;
  }
}

