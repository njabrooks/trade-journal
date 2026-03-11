/**
 * Parse forensic audit markdown into structured JSON claims
 *
 * Converts markdown audit format (from process-transcript skill) into
 * the JSON structure expected by ClaimsBrowser component.
 *
 * Uses canonical types from @/types/claims to avoid field name drift.
 */

// Re-export canonical types for consumers that import from here
export type { MainClaim, EvidenceClaim, ClaimsStructure } from '@/types/claims';
import type { MainClaim, EvidenceClaim, ClaimsStructure } from '@/types/claims';

/**
 * Parse the full audit markdown into claims structure
 */
export function parseClaimsMarkdown(markdownContent: string): ClaimsStructure {
  // Split by frontmatter to get body content
  const parts = markdownContent.split('---');
  const body = parts.length >= 3 ? parts.slice(2).join('---').trim() : markdownContent;

  // Split into main claims and evidence claims sections
  const mainClaimsMatch = body.match(/## Main Claims \(Macro Thesis \/ Asset Thesis Candidates\)([\s\S]*?)(?=## Evidence Claims|$)/);
  const evidenceClaimsMatch = body.match(/## Evidence Claims \(Supporting\/Rebutting\)([\s\S]*?)$/);

  const mainClaimsText = mainClaimsMatch ? mainClaimsMatch[1] : '';
  const evidenceClaimsText = evidenceClaimsMatch ? evidenceClaimsMatch[1] : '';

  // Parse main claims
  const mainClaims = parseMainClaims(mainClaimsText);

  // Parse evidence claims
  const evidenceClaims = parseEvidenceClaims(evidenceClaimsText);

  // Extract frontmatter metadata if present
  let extractionDate = new Date().toISOString().split('T')[0]; // Default to today
  let sourceSkill = 'process-transcript'; // Default

  if (parts.length >= 3) {
    const frontmatter = parts[1];
    const auditDateMatch = frontmatter.match(/audit_date:\s*["']?([^"'\n]+)["']?/);
    if (auditDateMatch) {
      extractionDate = auditDateMatch[1].trim();
    }
  }

  return {
    main_claims: mainClaims,
    evidence_claims: evidenceClaims,
    metadata: {
      extraction_date: extractionDate,
      source_skill: sourceSkill,
      toulmin_version: '1.0',
    },
  };
}

/**
 * Parse main claims section
 */
function parseMainClaims(text: string): MainClaim[] {
  const claims: MainClaim[] = [];

  // Split by claim headers (### Claim N:)
  const claimBlocks = text.split(/(?=### Claim \d+:)/);

  for (const block of claimBlocks) {
    if (!block.trim() || !block.includes('### Claim')) continue;

    const claim = parseMainClaimBlock(block);
    if (claim) claims.push(claim);
  }

  return claims;
}

/**
 * Parse a single main claim block
 */
function parseMainClaimBlock(block: string): MainClaim | null {
  // Extract claim number and title
  const titleMatch = block.match(/### Claim (\d+): (.+)/);
  if (!titleMatch) return null;

  const claimNumber = titleMatch[1];
  const title = titleMatch[2].trim();
  const id = `claim-${claimNumber}`;

  // Extract metadata fields
  const level = extractField(block, 'Level') || 'main';
  const type = normalizeEnum(extractField(block, 'Type') || 'macro_thesis_candidate') as 'macro_thesis_candidate' | 'asset_thesis_candidate';
  const category = normalizeEnum(extractField(block, 'Category') || 'macro') as 'macro' | 'asset_specific';
  const tickersRaw = extractField(block, 'Tickers') || '';
  const relevant_tickers = tickersRaw === 'N/A' ? [] : tickersRaw.split(',').map(t => t.trim()).filter(Boolean);
  const time_horizon = normalizeEnum(extractField(block, 'Time Horizon') || 'medium_term') as 'long_term' | 'medium_term' | 'short_term';
  const qualifier = normalizeEnum(extractField(block, 'Qualifier') || 'medium') as 'high' | 'medium' | 'low' | 'exploratory';

  // Extract content sections
  const claim = extractSection(block, 'Claim');
  const evidence = extractBulletList(block, 'Evidence');
  const reasoning = extractSection(block, 'Reasoning');
  const backing = extractSection(block, 'Backing');
  const rebuttal = extractBulletList(block, 'Rebuttal');

  // Extract evidence claim references
  const supportingRaw = extractField(block, 'Supporting Evidence Claims') || '';
  const supporting_evidence_claims = supportingRaw === 'None identified' ? [] :
    supportingRaw.split(',').map(s => s.trim()).filter(Boolean);

  const rebuttingRaw = extractField(block, 'Rebutting Evidence Claims') || '';
  const rebutting_evidence_claims = rebuttingRaw === 'None identified' ? [] :
    rebuttingRaw.split(',').map(s => s.trim()).filter(Boolean);

  return {
    id,
    title,
    level: 'main',
    type,
    category,
    relevant_tickers,
    time_horizon,
    qualifier,
    claim,
    evidence,
    reasoning,
    backing,
    rebuttal,
    supporting_evidence_claims,
    rebutting_evidence_claims,
    converted_to: null,
  };
}

/**
 * Parse evidence claims section
 */
function parseEvidenceClaims(text: string): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];

  // Split by claim headers: ### Claim N: or ### E1:/EC1: format
  const claimBlocks = text.split(/(?=### (?:Claim \d+|EC?\d+):)/);

  for (const block of claimBlocks) {
    if (!block.trim() || !block.match(/### (?:Claim \d+|EC?\d+):/)) continue;

    const claim = parseEvidenceClaimBlock(block);
    if (claim) claims.push(claim);
  }

  return claims;
}

/**
 * Parse a single evidence claim block
 */
function parseEvidenceClaimBlock(block: string): EvidenceClaim | null {
  // Extract claim number and title: ### Claim N: or ### E1:/EC1: format
  const titleMatch = block.match(/### (?:Claim )?(\d+|EC?\d+): (.+)/);
  if (!titleMatch) return null;

  const claimNumber = titleMatch[1];
  const title = titleMatch[2].trim();
  const id = `claim-${claimNumber}`;

  // Extract metadata fields
  const type = normalizeEnum(extractField(block, 'Type') || 'supporting') as 'supporting' | 'rebutting';
  const supports = extractField(block, 'Supports') || '';
  const qualifier = normalizeEnum(extractField(block, 'Qualifier') || 'medium') as 'high' | 'medium' | 'low' | 'exploratory';

  // Extract content sections (full Toulmin framework)
  const claim = extractSection(block, 'Claim');
  const evidence = extractBulletList(block, 'Evidence');
  const reasoning = extractSection(block, 'Reasoning');
  const backing = extractSection(block, 'Backing');
  const rebuttal = extractSection(block, 'Rebuttal');

  return {
    id,
    title,
    level: 'evidence',
    type,
    supports,
    claim,
    evidence,
    reasoning,
    backing,
    qualifier,
    ...(rebuttal ? { rebuttal } : {}),
  };
}

/**
 * Normalize enum values from audit markdown to DB-compatible format.
 * Handles: "Macro" → "macro", "Medium-term" → "medium_term", "Asset-specific" → "asset_specific"
 */
function normalizeEnum(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')     // "medium-term" → "medium_term"
    .replace(/\s+/g, '_');  // "macro thesis candidate" → "macro_thesis_candidate"
}

/**
 * Extract a simple field value (e.g., **Level**: main or **Level**:** main)
 */
function extractField(block: string, fieldName: string): string | null {
  // Try both **Field**: value and **Field**:** value formats
  let marker = `**${fieldName}:**`;
  let idx = block.indexOf(marker);
  if (idx === -1) {
    marker = `**${fieldName}**:`;
    idx = block.indexOf(marker);
  }
  if (idx === -1) return null;
  const after = idx + marker.length;
  const lineEnd = block.indexOf('\n', after);
  if (lineEnd === -1) return block.substring(after).trim();
  return block.substring(after, lineEnd).trim();
}

/**
 * Extract a multi-line section (e.g., **Claim**:\n paragraph text)
 */
function extractSection(block: string, sectionName: string): string {
  // Try both **Claim**: and **Claim**:** formats
  let marker = `**${sectionName}:`;
  let startIdx = block.indexOf(marker);
  if (startIdx === -1) {
    marker = `**${sectionName}**:`;
    startIdx = block.indexOf(marker);
  }
  if (startIdx === -1) return '';
  const afterMarker = startIdx + marker.length;
  // Find next ** at start of line or ---
  const nextSection = block.indexOf('\n**', afterMarker);
  const endMarker = block.indexOf('\n---', afterMarker);
  let endIdx = -1;
  if (nextSection !== -1 && endMarker !== -1) endIdx = Math.min(nextSection, endMarker);
  else if (nextSection !== -1) endIdx = nextSection;
  else endIdx = endMarker;
  if (endIdx === -1) return block.substring(afterMarker).trim();
  return block.substring(afterMarker, endIdx).trim();
}

/**
 * Extract a bullet list section (e.g., **Evidence**:\n- item1\n- item2)
 */
function extractBulletList(block: string, sectionName: string): string[] {
  // Try both **Evidence**: and **Evidence**:** formats
  let marker = `**${sectionName}:`;
  let startIdx = block.indexOf(marker);
  if (startIdx === -1) {
    marker = `**${sectionName}**:`;
    startIdx = block.indexOf(marker);
  }
  if (startIdx === -1) return [];
  const afterMarker = startIdx + marker.length;
  // Find next ** at start of line or ---
  const nextSection = block.indexOf('\n**', afterMarker);
  const endMarker = block.indexOf('\n---', afterMarker);
  let endIdx = -1;
  if (nextSection !== -1 && endMarker !== -1) endIdx = Math.min(nextSection, endMarker);
  else if (nextSection !== -1) endIdx = nextSection;
  else endIdx = endMarker;
  const text = (endIdx === -1 ? block.substring(afterMarker) : block.substring(afterMarker, endIdx)).trim();

  // Split by bullet points and clean up
  const items = text
    .split(/\n-\s+/)
    .map(item => item.trim())
    .map(item => item.replace(/^-\s+/, ''))
    .filter(item => item.length > 0);

  return items;
}
