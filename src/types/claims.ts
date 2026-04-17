/**
 * Type definitions for hierarchical Toulmin claim structure
 * Used in research_insights.claims_structure JSONB column
 *
 * Based on Toulmin's argumentation framework:
 * - Claim: The assertion being made
 * - Evidence: Supporting data and observations
 * - Reasoning: Logic connecting evidence to claim
 * - Backing: Additional support for the reasoning
 * - Qualifier: Confidence level in the claim
 * - Rebuttal: Counter-arguments or exceptions
 */

// ============================================================================
// Main Claim (Macro Thesis / Asset Thesis Candidates)
// ============================================================================

export type ClaimType = 'macro_thesis_candidate' | 'asset_thesis_candidate';
export type ClaimCategory = 'macro' | 'asset_specific';
export type ClaimConfidence = 'high' | 'medium' | 'low' | 'exploratory';
export type TimeHorizon = 'long_term' | 'medium_term' | 'short_term';

export interface MainClaim {
  // Identity
  id: string; // e.g., "claim-1"
  title: string; // Concise heading for the claim
  level: 'main';
  type: ClaimType;
  category: ClaimCategory;

  // Toulmin Framework
  claim: string; // The main assertion
  evidence: string[]; // Supporting data and observations
  reasoning: string; // Logic connecting evidence to claim
  backing: string; // Additional support for the reasoning
  qualifier: ClaimConfidence; // Confidence level
  rebuttal: string[]; // Counter-arguments or exceptions

  // Metadata
  time_horizon?: TimeHorizon;
  relevant_tickers?: string[]; // For asset_specific claims

  // Hierarchical References
  supporting_evidence_claims: string[]; // IDs of evidence claims that support this
  rebutting_evidence_claims: string[]; // IDs of evidence claims that challenge this

  // Conversion Tracking
  converted_to: null | {
    type: 'macro_thesis' | 'asset_thesis';
    id: string; // UUID of created thesis
    converted_at: string; // ISO timestamp
  };
}

// ============================================================================
// Evidence Claim (Supporting/Rebutting Evidence)
// ============================================================================

export type EvidenceClaimType = 'supporting' | 'rebutting';

export interface EvidenceClaim {
  // Identity
  id: string; // e.g., "claim-19"
  title: string; // Concise heading for the evidence claim
  level: 'evidence';
  type: EvidenceClaimType;
  supports: string; // References main claim ID

  // Full Toulmin Framework (evidence claims get complete structure too)
  claim: string; // The evidence assertion
  evidence: string[]; // Supporting data points
  reasoning: string; // Logic connecting evidence to claim
  backing: string; // Additional support for the reasoning
  qualifier: ClaimConfidence; // Confidence level
  rebuttal?: string; // Counter-arguments or exceptions
}

// ============================================================================
// Claims Structure Container
// ============================================================================

export interface ClaimsStructure {
  main_claims: MainClaim[];
  evidence_claims: EvidenceClaim[];
  metadata: {
    extraction_date: string; // YYYY-MM-DD
    source_skill: string; // e.g., "/process-transcript", "migration", "manual"
    toulmin_version: string; // e.g., "1.0"
  };
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Flat claim format (legacy, for backward compatibility)
 * Used in old key_claims, supporting_evidence, counter_evidence columns
 */
export interface LegacyClaim {
  claim?: string;
  text?: string;
  evidence?: string;
  reasoning?: string;
  confidence?: string;
  tickers?: string[];
}

/**
 * Conversion data passed to convert-claim API
 */
export interface ClaimConversionData {
  // Common fields
  title: string;
  description: string;
  timeHorizon: TimeHorizon;
  confidenceLevel: ClaimConfidence;
  notes?: string;

  // Thesis-specific
  thesisType?: 'secular' | 'cyclical' | 'structural' | 'tactical';

  // View-specific
  ticker?: string;
  viewType?: 'bullish' | 'bearish' | 'neutral' | 'complex';
  macroThesisId?: string; // Link to parent thesis
}

// ============================================================================
// Validation Helpers
// ============================================================================

export function isMainClaim(claim: any): claim is MainClaim {
  return claim?.level === 'main';
}

export function isEvidenceClaim(claim: any): claim is EvidenceClaim {
  return claim?.level === 'evidence';
}

export function isValidClaimsStructure(data: any): data is ClaimsStructure {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.main_claims) &&
    Array.isArray(data.evidence_claims) &&
    data.metadata &&
    typeof data.metadata.extraction_date === 'string' &&
    typeof data.metadata.source_skill === 'string'
  );
}

export function getSupportingEvidence(
  mainClaimId: string,
  claimsStructure: ClaimsStructure
): EvidenceClaim[] {
  const mainClaim = claimsStructure.main_claims.find(c => c.id === mainClaimId);
  if (!mainClaim) return [];

  return claimsStructure.evidence_claims.filter(e =>
    (mainClaim.supporting_evidence_claims ?? []).includes(e.id)
  );
}

export function getRebuttingEvidence(
  mainClaimId: string,
  claimsStructure: ClaimsStructure
): EvidenceClaim[] {
  const mainClaim = claimsStructure.main_claims.find(c => c.id === mainClaimId);
  if (!mainClaim) return [];

  return claimsStructure.evidence_claims.filter(e =>
    (mainClaim.rebutting_evidence_claims ?? []).includes(e.id)
  );
}

export function getUnconvertedClaims(claimsStructure: ClaimsStructure): MainClaim[] {
  return claimsStructure.main_claims.filter(c => !c.converted_to);
}

export function getConvertedClaims(claimsStructure: ClaimsStructure): MainClaim[] {
  return claimsStructure.main_claims.filter(c => !!c.converted_to);
}

export function getClaimsByType(
  claimsStructure: ClaimsStructure,
  type: ClaimType
): MainClaim[] {
  return claimsStructure.main_claims.filter(c => c.type === type);
}

export function getClaimsByCategory(
  claimsStructure: ClaimsStructure,
  category: ClaimCategory
): MainClaim[] {
  return claimsStructure.main_claims.filter(c => c.category === category);
}

// ============================================================================
// First-Class Database Entities (Phase 1)
// ============================================================================

/**
 * Database-level Main Claim - First-class entity that can:
 * - Accumulate evidence from multiple audits over time
 * - Link to multiple theses/views (many-to-many)
 * - Track confidence evolution
 * - Have independent lifecycle
 *
 * Distinct from audit-level MainClaim (stored in JSONB)
 */
export interface DbMainClaim {
  id: string; // UUID

  // Claim identity
  title: string;
  category: 'macro' | 'asset_specific';

  // Toulmin Framework (full structure)
  claim: string;
  evidence: string[] | null; // Array of evidence points
  reasoning: string | null;
  backing: string | null;
  qualifier: 'high' | 'medium' | 'low' | 'exploratory' | null;
  rebuttal: string[] | null; // Array of rebuttal points

  // Metadata
  timeHorizon: 'long_term' | 'medium_term' | 'short_term' | null;
  relevantTickers: string[] | null;

  // Lifecycle (standardized #ENH-048)
  status: 'draft' | 'active' | 'complete' | 'rejected';
  confidenceEvolution: any | null; // JSONB tracking confidence changes

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastEvidenceAddedAt: Date | null;
}

/**
 * Database-level Main Claim Evidence - Links supporting claims from audits to main claims
 */
export interface DbMainClaimEvidence {
  id: string; // UUID
  mainClaimId: string;
  researchInsightId: string;

  // Path to supporting claim in claims_structure JSONB
  supportingClaimId: string; // e.g., "claim-2"

  // Relationship
  relationshipType: 'supports' | 'refutes' | 'qualifies';

  // Metadata
  addedAt: Date;
  addedBy: string | null;
  notes: string | null;
}

/**
 * Database-level Claim Thesis Mapping - Many-to-many relationships between claims and theses/views
 */
export interface DbClaimThesisMapping {
  id: string; // UUID
  mainClaimId: string;

  // Exactly one of these
  macroThesisId: string | null;
  assetThesisId: string | null;

  // Relationship
  mappingType: 'supports' | 'refutes' | 'foundation';
  confidence: 'high' | 'medium' | 'low' | null;

  // Metadata
  mappedAt: Date;
  mappedBy: string;
  notes: string | null;
}

/**
 * Enhanced Macro Thesis with position fields
 */
export interface DbMacroThesisEnhanced {
  // Existing fields (from schema.ts MacroThesis type)
  id: string;
  title: string;
  description: string | null;
  thesisType: 'secular' | 'cyclical' | 'structural';
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;

  // NEW: Position structure
  sectors: string[] | null;
  direction: 'bullish' | 'bearish' | 'neutral' | null;
  positionStartDate: string | null; // Date string
  positionEndDate: string | null; // Date string

  // NEW: Outcome tracking
  outcome: 'validated' | 'invalidated' | 'partial' | 'ongoing' | null;
  outcomeNotes: string | null;
  actualOutcomeDate: string | null; // Date string

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastReviewedAt: Date | null;
  nextReviewDueAt: Date | null;
  notes: any | null;
}

/**
 * Enhanced Asset Thesis with position fields
 */
export interface DbAssetThesisEnhanced {
  // Existing fields
  id: string;
  macroThesisId: string | null;
  underlyingId: string | null;
  title: string;
  description: string | null;
  narrative: string | null;
  fundamentalContext: string | null;
  positioningContext: string | null;
  regimeContext: string | null;
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;

  // NEW: Position structure
  direction: 'bullish' | 'bearish' | 'neutral' | null;
  positionStartDate: string | null; // Date string
  positionEndDate: string | null; // Date string

  // NEW: Price targets
  targetPrice: string | null; // numeric as string
  entryReferencePrice: string | null; // numeric as string

  // NEW: Outcome tracking
  outcome: 'validated' | 'invalidated' | 'partial' | 'ongoing' | null;
  outcomeNotes: string | null;
  actualOutcomeDate: string | null; // Date string
  actualPrice: string | null; // numeric as string

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastReviewedAt: Date | null;
  nextReviewDueAt: Date | null;
  notes: any | null;
}

// ============================================================================
// Type Guards for Database Entities
// ============================================================================

export function isDbMainClaim(data: any): data is DbMainClaim {
  return (
    data &&
    typeof data.id === 'string' &&
    typeof data.title === 'string' &&
    typeof data.claim === 'string' &&
    ['macro', 'asset_specific'].includes(data.category) &&
    ['draft', 'active', 'complete', 'rejected'].includes(data.status)
  );
}

export function isDbMainClaimEvidence(data: any): data is DbMainClaimEvidence {
  return (
    data &&
    typeof data.id === 'string' &&
    typeof data.mainClaimId === 'string' &&
    typeof data.researchInsightId === 'string' &&
    typeof data.supportingClaimId === 'string' &&
    ['supports', 'refutes', 'qualifies'].includes(data.relationshipType)
  );
}

export function isDbClaimThesisMapping(data: any): data is DbClaimThesisMapping {
  return (
    data &&
    typeof data.id === 'string' &&
    typeof data.mainClaimId === 'string' &&
    (data.macroThesisId || data.assetThesisId) &&
    ['supports', 'refutes', 'foundation'].includes(data.mappingType)
  );
}
