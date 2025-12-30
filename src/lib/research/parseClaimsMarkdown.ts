/**
 * Parse forensic audit markdown into structured JSON claims
 *
 * Converts markdown audit format (from process-transcript skill) into
 * the JSON structure expected by ClaimsBrowser component.
 */

export interface MainClaim {
  id: string;
  title: string;
  level: 'main';
  type: 'thesis_candidate' | 'view_candidate';
  category: 'macro' | 'asset_specific';
  tickers: string[];
  time_horizon: 'long_term' | 'medium_term' | 'short_term';
  qualifier: 'high' | 'medium' | 'low' | 'exploratory';
  claim: string;
  evidence: string[];
  reasoning: string;
  backing: string;
  rebuttal: string[];
  supporting_evidence_claims: string[];
  rebutting_evidence_claims: string[];
}

export interface EvidenceClaim {
  id: string;
  title: string;
  level: 'evidence';
  type: 'supporting' | 'rebutting';
  supports: string; // References main claim ID
  claim: string;
  evidence: string[];
  qualifier: 'high' | 'medium' | 'low' | 'exploratory';
  rebuttal?: string;
}

export interface ClaimsStructure {
  main_claims: MainClaim[];
  evidence_claims: EvidenceClaim[];
  metadata: {
    extraction_date: string;
    source_skill: string;
    toulmin_version?: string;
  };
}

/**
 * Parse the full audit markdown into claims structure
 */
export function parseClaimsMarkdown(markdownContent: string): ClaimsStructure {
  // Split by frontmatter to get body content
  const parts = markdownContent.split('---');
  const body = parts.length >= 3 ? parts.slice(2).join('---').trim() : markdownContent;

  // Split into main claims and evidence claims sections
  const mainClaimsMatch = body.match(/## Main Claims \(Thesis\/View Candidates\)([\s\S]*?)(?=## Evidence Claims|$)/);
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
  const type = extractField(block, 'Type') as 'thesis_candidate' | 'view_candidate' || 'thesis_candidate';
  const category = extractField(block, 'Category') as 'macro' | 'asset_specific' || 'macro';
  const tickersRaw = extractField(block, 'Tickers') || '';
  const tickers = tickersRaw === 'N/A' ? [] : tickersRaw.split(',').map(t => t.trim()).filter(Boolean);
  const time_horizon = extractField(block, 'Time Horizon') as 'long_term' | 'medium_term' | 'short_term' || 'medium_term';
  const qualifier = extractField(block, 'Qualifier') as 'high' | 'medium' | 'low' | 'exploratory' || 'medium';

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
    tickers,
    time_horizon,
    qualifier,
    claim,
    evidence,
    reasoning,
    backing,
    rebuttal,
    supporting_evidence_claims,
    rebutting_evidence_claims,
  };
}

/**
 * Parse evidence claims section
 */
function parseEvidenceClaims(text: string): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];

  // Split by claim headers (### Claim N:)
  const claimBlocks = text.split(/(?=### Claim \d+:)/);

  for (const block of claimBlocks) {
    if (!block.trim() || !block.includes('### Claim')) continue;

    const claim = parseEvidenceClaimBlock(block);
    if (claim) claims.push(claim);
  }

  return claims;
}

/**
 * Parse a single evidence claim block
 */
function parseEvidenceClaimBlock(block: string): EvidenceClaim | null {
  // Extract claim number and title
  const titleMatch = block.match(/### Claim (\d+): (.+)/);
  if (!titleMatch) return null;

  const claimNumber = titleMatch[1];
  const title = titleMatch[2].trim();
  const id = `claim-${claimNumber}`;

  // Extract metadata fields
  const type = extractField(block, 'Type') as 'supporting' | 'rebutting' || 'supporting';
  const supports = extractField(block, 'Supports') || '';
  const qualifier = extractField(block, 'Qualifier') as 'high' | 'medium' | 'low' | 'exploratory' || 'medium';

  // Extract content sections
  const claim = extractSection(block, 'Claim');
  const evidence = extractBulletList(block, 'Evidence');
  const rebuttal = extractSection(block, 'Rebuttal');

  return {
    id,
    title,
    level: 'evidence',
    type,
    supports,
    claim,
    evidence,
    qualifier,
    ...(rebuttal ? { rebuttal } : {}),
  };
}

/**
 * Extract a simple field value (e.g., **Level**: main)
 */
function extractField(block: string, fieldName: string): string | null {
  const regex = new RegExp(`\\*\\*${fieldName}\\*\\*:\\s*(.+?)(?:\\n|$)`, 'i');
  const match = block.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract a multi-line section (e.g., **Claim**: paragraph text)
 */
function extractSection(block: string, sectionName: string): string {
  const regex = new RegExp(`\\*\\*${sectionName}\\*\\*:\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*[A-Z]|\\n---|$)`, 'i');
  const match = block.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Extract a bullet list section (e.g., **Evidence**: \n- item1\n- item2)
 */
function extractBulletList(block: string, sectionName: string): string[] {
  const regex = new RegExp(`\\*\\*${sectionName}\\*\\*:\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*[A-Z]|\\n---|$)`, 'i');
  const match = block.match(regex);

  if (!match) return [];

  const text = match[1].trim();

  // Split by bullet points and clean up
  const items = text
    .split(/\n-\s+/)
    .map(item => item.trim())
    .map(item => item.replace(/^-\s+/, '')) // Remove leading "- " if present
    .filter(item => item.length > 0);

  return items;
}
