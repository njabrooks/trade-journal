import matter from 'gray-matter';
import type { MainClaim, MacroThesis, AssetView } from '@/db/schema';

/**
 * Obsidian frontmatter types
 */
export interface ObsidianFrontmatter {
  id: string;
  type: 'main_claim' | 'macro_thesis' | 'asset_view';
  created_at: string;
  updated_at: string;
  last_synced_at: string;
  sync_source: 'obsidian' | 'database';

  // Main claim specific
  category?: 'macro' | 'asset_specific';
  status?: string;
  confidence?: string;
  time_horizon?: string;
  linked_to_theses?: number;
  linked_to_views?: number;

  // Thesis specific
  thesis_type?: string;
  sectors?: string[];
  direction?: string;
  position_start_date?: string;
  position_end_date?: string;
  outcome?: string;

  // View specific
  ticker?: string;
  target_price?: number;
  entry_reference_price?: number;
  actual_price?: number;
  actual_outcome_date?: string;

  // Shared
  confidence_level?: string;
}

export interface ParsedMarkdown {
  frontmatter: ObsidianFrontmatter;
  content: string;
  wikiLinks: string[];
}

/**
 * Parse markdown file content and extract frontmatter
 */
export function parseMarkdown(fileContent: string): ParsedMarkdown {
  const parsed = matter(fileContent);
  const frontmatter = parsed.data as ObsidianFrontmatter;
  const content = parsed.content;

  // Extract wikilinks [[...]]
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  const wikiLinks: string[] = [];
  let match;
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    wikiLinks.push(match[1]);
  }

  return {
    frontmatter,
    content,
    wikiLinks,
  };
}

/**
 * Generate frontmatter YAML from database entity
 */
export function generateFrontmatter(
  entity: MainClaim | MacroThesis | AssetView,
  type: 'main_claim' | 'macro_thesis' | 'asset_view',
  linkedCounts?: { theses?: number; views?: number }
): ObsidianFrontmatter {
  const base: ObsidianFrontmatter = {
    id: entity.id,
    type,
    created_at: entity.createdAt.toISOString(),
    updated_at: entity.updatedAt.toISOString(),
    last_synced_at: new Date().toISOString(),
    sync_source: 'database',
  };

  if (type === 'main_claim') {
    const claim = entity as MainClaim;
    const frontmatter = {
      ...base,
      category: claim.category as 'macro' | 'asset_specific',
      status: claim.status,
      confidence: claim.qualifier || undefined,
      time_horizon: claim.timeHorizon || undefined,
      linked_to_theses: linkedCounts?.theses || 0,
      linked_to_views: linkedCounts?.views || 0,
    };

    // Remove undefined values to avoid YAML serialization errors
    return Object.fromEntries(
      Object.entries(frontmatter).filter(([_, value]) => value !== undefined)
    ) as unknown as ObsidianFrontmatter;
  }

  if (type === 'macro_thesis') {
    const thesis = entity as MacroThesis;
    const frontmatter = {
      ...base,
      thesis_type: thesis.thesisType,
      sectors: thesis.sectors || undefined,
      direction: thesis.direction || undefined,
      position_start_date: thesis.positionStartDate || undefined,
      position_end_date: thesis.positionEndDate || undefined,
      outcome: thesis.outcome || undefined,
      confidence_level: thesis.confidenceLevel || undefined,
    };

    // Remove undefined values to avoid YAML serialization errors
    return Object.fromEntries(
      Object.entries(frontmatter).filter(([_, value]) => value !== undefined)
    ) as unknown as ObsidianFrontmatter;
  }

  if (type === 'asset_view') {
    const view = entity as AssetView;
    const frontmatter = {
      ...base,
      // ticker would need to be passed separately or joined from underlyings table
      direction: view.direction || undefined,
      position_start_date: view.positionStartDate || undefined,
      position_end_date: view.positionEndDate || undefined,
      target_price: view.targetPrice ? Number(view.targetPrice) : undefined,
      entry_reference_price: view.entryReferencePrice ? Number(view.entryReferencePrice) : undefined,
      actual_price: view.actualPrice ? Number(view.actualPrice) : undefined,
      actual_outcome_date: view.actualOutcomeDate || undefined,
      outcome: view.outcome || undefined,
      confidence_level: view.confidenceLevel || undefined,
    };

    // Remove undefined values to avoid YAML serialization errors
    return Object.fromEntries(
      Object.entries(frontmatter).filter(([_, value]) => value !== undefined)
    ) as unknown as ObsidianFrontmatter;
  }

  return base;
}

/**
 * Generate markdown content for main claim
 */
export function generateMainClaimMarkdown(claim: MainClaim): string {
  const sections: string[] = [];

  sections.push(`# ${claim.title}\n`);

  sections.push(`## Claim`);
  sections.push(claim.claim + '\n');

  if (claim.evidence) {
    sections.push(`## Evidence`);
    sections.push(claim.evidence + '\n');
  }

  if (claim.reasoning) {
    sections.push(`## Reasoning`);
    sections.push(claim.reasoning + '\n');
  }

  if (claim.backing) {
    sections.push(`## Backing`);
    sections.push(claim.backing + '\n');
  }

  if (claim.qualifier) {
    sections.push(`## Confidence (Qualifier)`);
    sections.push(claim.qualifier.charAt(0).toUpperCase() + claim.qualifier.slice(1) + '\n');
  }

  if (claim.rebuttal) {
    sections.push(`## Rebuttal`);
    sections.push(claim.rebuttal + '\n');
  }

  sections.push(`---\n`);
  sections.push(`## Supporting Evidence\n`);
  sections.push(`_Evidence links will be populated from the database_\n`);

  sections.push(`---\n`);
  sections.push(`## Linked Theses/Views\n`);
  sections.push(`_Thesis/view links will be populated from the database_\n`);

  sections.push(`---\n`);
  sections.push(`## Evolution Log\n`);
  sections.push(`**${new Date().toISOString().split('T')[0]}**: Initial claim created\n`);

  return sections.join('\n');
}

/**
 * Generate markdown content for macro thesis
 */
export function generateMacroThesisMarkdown(
  thesis: MacroThesis
): string {
  const sections: string[] = [];

  sections.push(`# ${thesis.title}\n`);

  sections.push(`## Position`);
  sections.push(`**Sectors**: ${thesis.sectors?.join(', ') || 'N/A'}`);
  sections.push(`**Direction**: ${thesis.direction}`);
  sections.push(`**Timeframe**: ${thesis.positionStartDate || 'N/A'} → ${thesis.positionEndDate || 'N/A'}`);
  sections.push(`**Thesis Type**: ${thesis.thesisType}\n`);

  sections.push(`## Rationale Summary`);
  sections.push(thesis.description + '\n');

  if (thesis.notes) {
    sections.push(`## Notes`);
    // Handle JSONB notes field - convert to string if needed
    const notesText = typeof thesis.notes === 'string'
      ? thesis.notes
      : JSON.stringify(thesis.notes, null, 2);
    sections.push(notesText + '\n');
  }

  sections.push(`---\n`);
  sections.push(`## Main Claims Supporting This Thesis\n`);
  sections.push(`_Main claim links will be populated from the database_\n`);

  sections.push(`---\n`);
  sections.push(`## Related Positions\n`);
  sections.push(`_Related theses, views, and strategies will be populated from the database_\n`);

  sections.push(`---\n`);
  sections.push(`## Outcome Tracking`);
  sections.push(`**Status**: ${thesis.outcome || 'ongoing'}`);
  sections.push(`**Last Review**: ${new Date().toISOString().split('T')[0]}`);
  sections.push(`**Next Review**: _TBD_\n`);

  return sections.join('\n');
}

/**
 * Generate markdown content for asset view
 */
export function generateAssetViewMarkdown(
  view: AssetView,
  ticker: string
): string {
  const sections: string[] = [];

  sections.push(`# ${view.title}\n`);

  sections.push(`## Position`);
  sections.push(`**Underlying**: ${ticker}`);
  sections.push(`**Direction**: ${view.direction}`);
  sections.push(`**Timeframe**: ${view.positionStartDate || 'N/A'} → ${view.positionEndDate || 'N/A'}`);

  if (view.targetPrice) {
    sections.push(`**Target Price**: $${view.targetPrice}`);
  }
  if (view.entryReferencePrice) {
    sections.push(`**Entry Price**: $${view.entryReferencePrice}`);
  }
  sections.push('');

  sections.push(`## Narrative`);
  sections.push((view.narrative || 'N/A') + '\n');

  sections.push(`## Description`);
  sections.push(view.description + '\n');

  if (view.fundamentalContext) {
    sections.push(`## Fundamental Context`);
    sections.push(view.fundamentalContext + '\n');
  }

  if (view.positioningContext) {
    sections.push(`## Positioning Context`);
    sections.push(view.positioningContext + '\n');
  }

  if (view.regimeContext) {
    sections.push(`## Regime Context`);
    sections.push(view.regimeContext + '\n');
  }

  sections.push(`---\n`);
  sections.push(`## Main Claims Supporting This View\n`);
  sections.push(`_Main claim links will be populated from the database_\n`);

  sections.push(`---\n`);
  sections.push(`## Related Positions\n`);
  sections.push(`_Related theses and strategies will be populated from the database_\n`);

  sections.push(`---\n`);
  sections.push(`## Outcome Tracking`);
  sections.push(`**Status**: ${view.outcome || 'ongoing'}`);

  if (view.actualPrice) {
    sections.push(`**Actual Price**: $${view.actualPrice}`);
  }
  if (view.actualOutcomeDate) {
    sections.push(`**Outcome Date**: ${view.actualOutcomeDate}`);
  }

  sections.push(`**Last Review**: ${new Date().toISOString().split('T')[0]}`);
  sections.push(`**Next Review**: _TBD_\n`);

  return sections.join('\n');
}

/**
 * Generate complete markdown file with frontmatter
 */
export function generateMarkdownFile(
  entity: MainClaim | MacroThesis | AssetView,
  type: 'main_claim' | 'macro_thesis' | 'asset_view',
  ticker?: string,
  linkedCounts?: { theses?: number; views?: number }
): string {
  const frontmatter = generateFrontmatter(entity, type, linkedCounts);

  let content: string;
  if (type === 'main_claim') {
    content = generateMainClaimMarkdown(entity as MainClaim);
  } else if (type === 'macro_thesis') {
    content = generateMacroThesisMarkdown(entity as MacroThesis);
  } else {
    content = generateAssetViewMarkdown(entity as AssetView, ticker!);
  }

  return matter.stringify(content, frontmatter);
}

/**
 * Sanitize filename for filesystem compatibility
 */
export function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

/**
 * Generate filepath for entity (flat structure)
 */
export function generateFilepath(
  type: 'main_claim' | 'macro_thesis' | 'asset_view',
  title: string,
  vaultPath: string,
  createdAt?: Date
): string {
  // Add YYYY-MM-DD prefix for consistent sorting
  const datePrefix = createdAt
    ? `${createdAt.toISOString().split('T')[0]}-`
    : `${new Date().toISOString().split('T')[0]}-`;

  // Add type prefix for flat structure
  const typePrefix =
    type === 'main_claim' ? 'main-claim-' :
    type === 'macro_thesis' ? 'macro-thesis-' :
    'asset-view-';

  const filename = datePrefix + typePrefix + sanitizeFilename(title) + '.md';

  // Flat structure: everything in investing/
  return `${vaultPath}/investing/${filename}`;
}
