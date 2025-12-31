-- Migration: Expand Evidence Claims to Full Toulmin Framework
-- Date: 2025-01-01
-- Type: Schema documentation (no actual DB changes - JSONB structure evolution)
--
-- CONTEXT:
-- Previously, evidence claims in research_insights.claims_structure JSONB only captured:
--   - claim, evidence[], qualifier, rebuttal (optional)
-- Missing: reasoning, backing (the full Toulmin framework)
--
-- CHANGES:
-- 1. Updated EvidenceClaim TypeScript interface to include reasoning + backing
-- 2. Updated parseClaimsMarkdown.ts to extract reasoning/backing for evidence claims
-- 3. Updated process-transcript skill template to generate full Toulmin for evidence
-- 4. Created ExpandableEvidenceClaim component for rich display
-- 5. Updated UnifiedClaimsBrowser to show expanded evidence claims
--
-- IMPACT:
-- - New audits will capture full Toulmin framework for evidence claims
-- - Existing audits with abbreviated evidence claims remain valid (backward compatible)
-- - UI now supports expanding evidence claims to view full argumentation structure
-- - No database migration needed (JSONB is schema-flexible)
--
-- VALIDATION:
-- Run after creating new audits with /process-transcript to verify:
-- 1. Evidence claims have reasoning and backing fields populated
-- 2. UI displays expandable evidence claim cards
-- 3. Expanded view shows: claim, evidence[], reasoning, backing, qualifier, rebuttal

-- No SQL changes required - this is a JSONB structure evolution
-- The claims_structure column already supports arbitrary JSON structure
-- TypeScript types and parsers enforce the new structure going forward

SELECT 'Evidence claims Toulmin framework expansion documented' AS status;

