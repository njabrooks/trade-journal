/**
 * Markdown ↔ JSON Formatters
 *
 * Parse markdown files into structured JSON for database upload.
 * Format database records back into markdown for editing.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ResearchArtifactData,
  ResearchInsightData,
  MacroThesisData,
  AssetViewData,
} from './validators';

/**
 * Parse frontmatter from markdown file
 */
export function parseFrontmatter(content: string): { metadata: Record<string, any>; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const [, frontmatter, body] = match;
  const metadata: Record<string, any> = {};

  // Parse YAML-like frontmatter (simple key: value pairs)
  frontmatter.split('\n').forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;

    const key = line.slice(0, colonIndex).trim();
    let value: any = line.slice(colonIndex + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Parse arrays
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v: string) => v.trim().replace(/^["']|["']$/g, ''));
    }

    // Parse booleans and nulls
    if (value === 'true') value = true;
    if (value === 'false') value = false;
    if (value === 'null') value = null;

    // Parse numbers
    if (/^\d+$/.test(value)) value = parseInt(value, 10);

    metadata[key] = value;
  });

  return { metadata, body: body.trim() };
}

/**
 * Parse finalized markdown into artifact + insight data
 */
export function parseFinalized(filePath: string): {
  artifact: Partial<ResearchArtifactData>;
  insight: Partial<ResearchInsightData>;
} {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { metadata, body } = parseFrontmatter(content);

  // Extract artifact data from metadata
  const artifact: Partial<ResearchArtifactData> = {
    title: metadata.title,
    author: metadata.author || null,
    sourceType: metadata.source_type || 'manual',
    sourceUrl: metadata.source_url || null,
    publishedDate: metadata.published_date || null,
    tags: metadata.tags || [],
    wordCount: metadata.word_count || 0,
    readingTimeMinutes: metadata.reading_time_minutes || 0,
    status: 'structured',
    rawContent: body, // Store full markdown body as raw content
  };

  // Parse insight data from markdown body sections
  const insight: Partial<ResearchInsightData> = {
    summary: extractSection(body, '## Summary'),
    keyThemes: parseListSection(body, '## Key Themes'),
    keyClaims: parseKeyClaims(body),
    supportingEvidence: parseEvidenceSection(body, '## Supporting Evidence'),
    counterEvidence: parseEvidenceSection(body, '## Counter Evidence / Risks'),
    timeHorizon: metadata.time_horizon || extractMetadataValue(body, 'Time Horizon'),
    confidenceLevel: metadata.confidence_level || extractMetadataValue(body, 'Confidence Level'),
    relevantTickers: metadata.relevant_tickers || parseTickersFromBody(body),
    humanReviewed: false,
    humanReviewNotes: null,
  };

  return { artifact, insight };
}

/**
 * Parse transcript markdown
 */
export function parseTranscript(filePath: string): Partial<ResearchArtifactData> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { metadata, body } = parseFrontmatter(content);

  return {
    title: metadata.title,
    author: metadata.author || null,
    sourceType: metadata.source_type || 'transcript',
    sourceUrl: metadata.source_url || null,
    publishedDate: metadata.published_date || null,
    tags: metadata.tags || [],
    rawContent: body,
    wordCount: countWords(body),
    readingTimeMinutes: Math.ceil(countWords(body) / 200), // ~200 wpm
    status: 'raw',
  };
}

/**
 * Parse deep dive markdown into structured data
 */
export function parseDeepDive(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { metadata, body } = parseFrontmatter(content);

  return {
    metadata,
    summary: extractSection(body, '## Summary'),
    keyThemes: parseListSection(body, '## Key Themes'),
    keyClaims: parseKeyClaims(body),
    supportingEvidence: parseEvidenceSection(body, '## Supporting Evidence'),
    counterEvidence: parseEvidenceSection(body, '## Counter Evidence / Risks'),
    relevantTickers: parseTickersSection(body),
    timeHorizon: extractMetadataValue(body, 'Time Horizon'),
    confidenceLevel: extractMetadataValue(body, 'Conviction Level'),
  };
}

/**
 * Parse macro thesis from markdown
 */
export function parseMacroThesis(filePath: string): Partial<MacroThesisData> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { metadata, body } = parseFrontmatter(content);

  return {
    title: metadata.title,
    description: extractSection(body, '## Description') || body,
    thesisType: metadata.thesis_type,
    conviction: metadata.conviction,
    timeHorizon: metadata.time_horizon,
    status: metadata.status || 'active',
    tags: metadata.tags || [],
    nextReviewDate: metadata.next_review_date || null,
  };
}

/**
 * Parse asset view from markdown
 */
export function parseAssetView(filePath: string): Partial<AssetViewData> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { metadata, body } = parseFrontmatter(content);

  return {
    underlying: metadata.underlying || metadata.ticker,
    title: metadata.title,
    description: extractSection(body, '## Description') || body,
    viewType: metadata.view_type,
    conviction: metadata.conviction,
    timeHorizon: metadata.time_horizon,
    status: metadata.status || 'active',
    macroThesisId: metadata.macro_thesis_id || null,
    tags: metadata.tags || [],
    nextReviewDate: metadata.next_review_date || null,
  };
}

// Helper functions

function extractSection(markdown: string, header: string): string {
  const regex = new RegExp(`${header}\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = markdown.match(regex);
  return match ? match[1].trim() : '';
}

function parseListSection(markdown: string, header: string): string[] {
  const section = extractSection(markdown, header);
  return section
    .split('\n')
    .filter((line) => line.trim().startsWith('-'))
    .map((line) => line.replace(/^-\s*/, '').trim());
}

function parseKeyClaims(markdown: string): Array<{ claim: string; evidence: string; confidence: 'high' | 'medium' | 'low' }> {
  const section = extractSection(markdown, '## Key Claims');
  const claims: Array<{ claim: string; evidence: string; confidence: 'high' | 'medium' | 'low' }> = [];

  // Match ### Claim headings
  const claimRegex = /###\s+Claim\s+\d+:\s+(.+?)\n-\s+\*\*Evidence\*\*:\s+(.+?)\n-\s+\*\*Confidence\*\*:\s+(\w+)/g;
  let match;

  while ((match = claimRegex.exec(section)) !== null) {
    const confidenceValue = match[3].toLowerCase();
    const confidence = (confidenceValue === 'high' || confidenceValue === 'medium' || confidenceValue === 'low')
      ? confidenceValue
      : 'medium';

    claims.push({
      claim: match[1].trim(),
      evidence: match[2].trim(),
      confidence,
    });
  }

  return claims;
}

function parseEvidenceSection(
  markdown: string,
  header: string
): Array<{ point: string; source: string }> {
  const section = extractSection(markdown, header);
  return section
    .split('\n')
    .filter((line) => line.trim().startsWith('-'))
    .map((line) => {
      const text = line.replace(/^-\s*/, '').trim();
      // Try to extract source from parentheses
      const sourceMatch = text.match(/\(source:\s*(.+?)\)$/i);
      return {
        point: sourceMatch ? text.replace(/\s*\(source:.*\)$/i, '').trim() : text,
        source: sourceMatch ? sourceMatch[1].trim() : 'transcript',
      };
    });
}

function parseTickersSection(markdown: string): Array<string> {
  const section = extractSection(markdown, '## Relevant Tickers');
  const tickers: string[] = [];

  section.split('\n').forEach((line) => {
    const match = line.match(/^-\s+\*\*([A-Z]+)\*\*/);
    if (match) {
      tickers.push(match[1]);
    }
  });

  return tickers;
}

function parseTickersFromBody(markdown: string): string[] {
  const tickersSection = extractSection(markdown, '## Relevant Tickers');
  if (tickersSection) {
    const matches = tickersSection.match(/\b[A-Z]{1,5}\b/g);
    return matches ? Array.from(new Set(matches)) : [];
  }
  return [];
}

function extractMetadataValue(markdown: string, label: string): string {
  const regex = new RegExp(`\\*\\*${label}\\*\\*:\\s*(.+)`, 'i');
  const match = markdown.match(regex);
  if (!match) return '';

  // Extract value and normalize to database enum format
  let value = match[1].trim().toLowerCase();

  // Handle parenthetical descriptions
  value = value.replace(/\s*\(.*\)/, '');

  // Normalize time horizon values
  if (value.includes('long')) return 'long_term';
  if (value.includes('medium')) return 'medium_term';
  if (value.includes('short')) return 'short_term';

  return value;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Format artifact data as markdown
 */
export function formatArtifactAsMarkdown(data: ResearchArtifactData): string {
  return `---
title: "${data.title}"
author: "${data.author || ''}"
source_type: "${data.sourceType}"
source_url: "${data.sourceUrl || ''}"
published_date: "${data.publishedDate || ''}"
tags: [${data.tags.map((t) => `"${t}"`).join(', ')}]
word_count: ${data.wordCount}
reading_time_minutes: ${data.readingTimeMinutes}
status: "${data.status}"
---

${data.rawContent}
`;
}

/**
 * Format insight data as markdown
 */
export function formatInsightAsMarkdown(data: ResearchInsightData): string {
  const claims = data.keyClaims
    .map(
      (c, i) => `### Claim ${i + 1}: ${c.claim}
- **Evidence**: ${c.evidence}
- **Confidence**: ${c.confidence}`
    )
    .join('\n\n');

  const supporting = data.supportingEvidence
    .map((e) => `- ${e.point} (source: ${e.source})`)
    .join('\n');

  const counter = data.counterEvidence.map((e) => `- ${e.point} (source: ${e.source})`).join('\n');

  return `# Research Insights

## Summary
${data.summary}

## Key Themes
${data.keyThemes.map((t) => `- ${t}`).join('\n')}

## Key Claims

${claims}

## Supporting Evidence
${supporting}

## Counter Evidence / Risks
${counter}

## Metadata
- **Time Horizon**: ${data.timeHorizon}
- **Confidence Level**: ${data.confidenceLevel}
- **Relevant Tickers**: [${data.relevantTickers.join(', ')}]
- **Human Reviewed**: ${data.humanReviewed ? 'Yes' : 'No'}
${data.humanReviewNotes ? `- **Review Notes**: ${data.humanReviewNotes}` : ''}
`;
}
