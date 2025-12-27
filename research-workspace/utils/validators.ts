/**
 * Schema Validators for Research Workflow
 *
 * Validates markdown data against database schema before upload.
 */

export interface ResearchArtifactData {
  title: string;
  author: string | null;
  sourceType: 'transcript' | 'article' | 'report' | 'video' | 'note' | 'manual';
  sourceUrl: string | null;
  publishedDate: string | null;
  rawContent: string;
  tags: string[];
  wordCount: number;
  readingTimeMinutes: number;
  status: 'raw' | 'processing' | 'structured' | 'error';
}

export interface ResearchInsightData {
  artifactId: string;
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
  humanReviewed: boolean;
  humanReviewNotes: string | null;
}

export interface MacroThesisData {
  title: string;
  description: string;
  thesisType: 'secular' | 'cyclical' | 'structural' | 'tactical';
  conviction: 'high' | 'medium' | 'low' | 'exploratory';
  timeHorizon: 'long_term' | 'medium_term' | 'short_term';
  status: 'active' | 'under_review' | 'retired';
  tags: string[];
  nextReviewDate: string | null;
}

export interface AssetViewData {
  underlying: string;
  title: string;
  description: string;
  viewType: 'bullish' | 'bearish' | 'neutral' | 'complex';
  conviction: 'high' | 'medium' | 'low' | 'exploratory';
  timeHorizon: 'long_term' | 'medium_term' | 'short_term';
  status: 'active' | 'under_review' | 'retired';
  macroThesisId: string | null;
  tags: string[];
  nextReviewDate: string | null;
}

export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(`Validation error on '${field}': ${message}`);
    this.name = 'ValidationError';
  }
}

/**
 * Validate research artifact data
 */
export function validateArtifact(data: Partial<ResearchArtifactData>): ResearchArtifactData {
  const errors: string[] = [];

  // Required fields
  if (!data.title?.trim()) {
    errors.push('title is required');
  }
  if (!data.rawContent?.trim()) {
    errors.push('rawContent is required');
  }

  // Enum validation
  const validSourceTypes = ['transcript', 'article', 'report', 'video', 'note', 'manual'];
  if (data.sourceType && !validSourceTypes.includes(data.sourceType)) {
    errors.push(`sourceType must be one of: ${validSourceTypes.join(', ')}`);
  }

  const validStatuses = ['raw', 'processing', 'structured', 'error'];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }

  // Ticker validation
  if (data.tags && !Array.isArray(data.tags)) {
    errors.push('tags must be an array');
  }

  if (errors.length > 0) {
    throw new Error(`Artifact validation failed:\n${errors.join('\n')}`);
  }

  return {
    title: data.title!.trim(),
    author: data.author?.trim() || null,
    sourceType: data.sourceType || 'manual',
    sourceUrl: data.sourceUrl?.trim() || null,
    publishedDate: data.publishedDate || null,
    rawContent: data.rawContent!.trim(),
    tags: data.tags || [],
    wordCount: data.wordCount || 0,
    readingTimeMinutes: data.readingTimeMinutes || 0,
    status: data.status || 'structured',
  };
}

/**
 * Validate research insight data
 */
export function validateInsight(data: Partial<ResearchInsightData>): Omit<ResearchInsightData, 'artifactId'> {
  const errors: string[] = [];

  // Required fields
  if (!data.summary?.trim()) {
    errors.push('summary is required');
  }

  // Arrays
  if (data.keyThemes && !Array.isArray(data.keyThemes)) {
    errors.push('keyThemes must be an array');
  }
  if (data.keyClaims && !Array.isArray(data.keyClaims)) {
    errors.push('keyClaims must be an array');
  }
  if (data.relevantTickers && !Array.isArray(data.relevantTickers)) {
    errors.push('relevantTickers must be an array');
  }

  // Enum validation
  const validTimeHorizons = ['long_term', 'medium_term', 'short_term', 'unknown'];
  if (data.timeHorizon && !validTimeHorizons.includes(data.timeHorizon)) {
    errors.push(`timeHorizon must be one of: ${validTimeHorizons.join(', ')}`);
  }

  const validConfidenceLevels = ['high', 'medium', 'low', 'exploratory'];
  if (data.confidenceLevel && !validConfidenceLevels.includes(data.confidenceLevel)) {
    errors.push(`confidenceLevel must be one of: ${validConfidenceLevels.join(', ')}`);
  }

  // Validate keyClaims structure
  if (data.keyClaims) {
    data.keyClaims.forEach((claim, idx) => {
      if (!claim.claim?.trim()) {
        errors.push(`keyClaims[${idx}].claim is required`);
      }
      if (claim.confidence && !['high', 'medium', 'low'].includes(claim.confidence)) {
        errors.push(`keyClaims[${idx}].confidence must be high, medium, or low`);
      }
    });
  }

  // Validate ticker format (basic check)
  if (data.relevantTickers) {
    data.relevantTickers.forEach((ticker, idx) => {
      if (!/^[A-Z]{1,5}$/.test(ticker)) {
        errors.push(`relevantTickers[${idx}] '${ticker}' is not a valid ticker format`);
      }
    });
  }

  if (errors.length > 0) {
    throw new Error(`Insight validation failed:\n${errors.join('\n')}`);
  }

  return {
    summary: data.summary!.trim(),
    keyThemes: data.keyThemes || [],
    keyClaims: data.keyClaims || [],
    supportingEvidence: data.supportingEvidence || [],
    counterEvidence: data.counterEvidence || [],
    timeHorizon: data.timeHorizon || 'unknown',
    confidenceLevel: data.confidenceLevel || 'exploratory',
    relevantTickers: data.relevantTickers || [],
    humanReviewed: data.humanReviewed || false,
    humanReviewNotes: data.humanReviewNotes || null,
  };
}

/**
 * Validate macro thesis data
 */
export function validateMacroThesis(data: Partial<MacroThesisData>): MacroThesisData {
  const errors: string[] = [];

  if (!data.title?.trim()) {
    errors.push('title is required');
  }
  if (!data.description?.trim()) {
    errors.push('description is required');
  }

  const validThesisTypes = ['secular', 'cyclical', 'structural', 'tactical'];
  if (data.thesisType && !validThesisTypes.includes(data.thesisType)) {
    errors.push(`thesisType must be one of: ${validThesisTypes.join(', ')}`);
  }

  const validConvictions = ['high', 'medium', 'low', 'exploratory'];
  if (data.conviction && !validConvictions.includes(data.conviction)) {
    errors.push(`conviction must be one of: ${validConvictions.join(', ')}`);
  }

  const validTimeHorizons = ['long_term', 'medium_term', 'short_term'];
  if (data.timeHorizon && !validTimeHorizons.includes(data.timeHorizon)) {
    errors.push(`timeHorizon must be one of: ${validTimeHorizons.join(', ')}`);
  }

  const validStatuses = ['active', 'under_review', 'retired'];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new Error(`Macro thesis validation failed:\n${errors.join('\n')}`);
  }

  return {
    title: data.title!.trim(),
    description: data.description!.trim(),
    thesisType: data.thesisType || 'tactical',
    conviction: data.conviction || 'exploratory',
    timeHorizon: data.timeHorizon || 'long_term',
    status: data.status || 'active',
    tags: data.tags || [],
    nextReviewDate: data.nextReviewDate || null,
  };
}

/**
 * Validate asset view data
 */
export function validateAssetView(data: Partial<AssetViewData>): AssetViewData {
  const errors: string[] = [];

  if (!data.underlying?.trim()) {
    errors.push('underlying (ticker) is required');
  }
  if (!data.title?.trim()) {
    errors.push('title is required');
  }
  if (!data.description?.trim()) {
    errors.push('description is required');
  }

  // Validate ticker format
  if (data.underlying && !/^[A-Z]{1,5}$/.test(data.underlying)) {
    errors.push(`underlying '${data.underlying}' is not a valid ticker format`);
  }

  const validViewTypes = ['bullish', 'bearish', 'neutral', 'complex'];
  if (data.viewType && !validViewTypes.includes(data.viewType)) {
    errors.push(`viewType must be one of: ${validViewTypes.join(', ')}`);
  }

  const validConvictions = ['high', 'medium', 'low', 'exploratory'];
  if (data.conviction && !validConvictions.includes(data.conviction)) {
    errors.push(`conviction must be one of: ${validConvictions.join(', ')}`);
  }

  const validTimeHorizons = ['long_term', 'medium_term', 'short_term'];
  if (data.timeHorizon && !validTimeHorizons.includes(data.timeHorizon)) {
    errors.push(`timeHorizon must be one of: ${validTimeHorizons.join(', ')}`);
  }

  const validStatuses = ['active', 'under_review', 'retired'];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new Error(`Asset view validation failed:\n${errors.join('\n')}`);
  }

  return {
    underlying: data.underlying!.trim().toUpperCase(),
    title: data.title!.trim(),
    description: data.description!.trim(),
    viewType: data.viewType || 'neutral',
    conviction: data.conviction || 'exploratory',
    timeHorizon: data.timeHorizon || 'medium_term',
    status: data.status || 'active',
    macroThesisId: data.macroThesisId || null,
    tags: data.tags || [],
    nextReviewDate: data.nextReviewDate || null,
  };
}
