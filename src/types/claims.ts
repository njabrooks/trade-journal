/**
 * Type definitions for hierarchical Toulmin claim structure
 * Used in research_insights.claims_structure JSONB column
 *
 * Based on Toulmin's argumentation framework:
 * - Claim: The assertion being made
 * - Grounds: Evidence supporting the claim
 * - Warrant: Reasoning connecting evidence to claim
 * - Backing: Additional support for the warrant
 * - Qualifier: Confidence level in the claim
 * - Rebuttal: Counter-arguments or exceptions
 */

// ============================================================================
// Main Claim (Thesis/View Candidates)
// ============================================================================

export type ClaimType = 'thesis_candidate' | 'view_candidate';
export type ClaimCategory = 'macro' | 'asset_specific';
export type ClaimConfidence = 'high' | 'medium' | 'low' | 'exploratory';
export type TimeHorizon = 'long_term' | 'medium_term' | 'short_term';

export interface MainClaim {
  // Identity
  id: string; // e.g., "claim-1"
  level: 'main';
  type: ClaimType;
  category: ClaimCategory;

  // Toulmin Framework
  claim: string; // The main assertion
  grounds: string; // Evidence (what we observe/measure)
  warrant: string; // Reasoning (why evidence supports claim)
  backing: string; // Additional support for the reasoning
  qualifier: ClaimConfidence; // Confidence level
  rebuttal: string; // Counter-arguments or exceptions

  // Metadata
  time_horizon?: TimeHorizon;
  relevant_tickers?: string[]; // For asset_specific claims

  // Hierarchical References
  supporting_evidence_claims: string[]; // IDs of evidence claims that support this
  rebutting_evidence_claims: string[]; // IDs of evidence claims that challenge this

  // Conversion Tracking
  converted_to: null | {
    type: 'macro_thesis' | 'asset_view';
    id: string; // UUID of created thesis/view
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
  level: 'evidence';
  type: EvidenceClaimType;

  // Simplified Toulmin (evidence claims don't need full structure)
  claim: string; // The evidence assertion
  grounds?: string; // Optional additional context
  confidence: ClaimConfidence;

  // References
  supports_main_claims: string[]; // Which main claims this evidence supports/refutes
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
  conviction: ClaimConfidence;
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
    mainClaim.supporting_evidence_claims.includes(e.id)
  );
}

export function getRebuttingEvidence(
  mainClaimId: string,
  claimsStructure: ClaimsStructure
): EvidenceClaim[] {
  const mainClaim = claimsStructure.main_claims.find(c => c.id === mainClaimId);
  if (!mainClaim) return [];

  return claimsStructure.evidence_claims.filter(e =>
    mainClaim.rebutting_evidence_claims.includes(e.id)
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
