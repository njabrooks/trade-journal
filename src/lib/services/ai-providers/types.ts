/**
 * AI Provider Types
 *
 * Abstract interface for AI model providers (ChatGPT, Gemini)
 */

export type AIModel =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'gpt-4o-2024-11-20'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash'
  | 'gemini-2.0-flash-exp'
  | 'gemini-pro';

export interface AIProviderConfig {
  model: AIModel;
  maxTokens?: number;
  temperature?: number;
}

export interface AIProviderResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AIProvider {
  /**
   * Get the model identifier for this provider
   */
  getModel(): AIModel;

  /**
   * Get the display name for this provider
   */
  getName(): string;

  /**
   * Get pricing information (per million tokens)
   */
  getPricing(): {
    input: number; // $ per million input tokens
    output: number; // $ per million output tokens
  };

  /**
   * Process a prompt and return the response
   */
  process(prompt: string, config?: Partial<AIProviderConfig>): Promise<AIProviderResponse>;

  /**
   * Estimate token count for a given text
   */
  estimateTokens(text: string): number;

  /**
   * Calculate cost for token usage
   */
  calculateCost(inputTokens: number, outputTokens: number): number;
}

export interface StructuredInsight {
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

