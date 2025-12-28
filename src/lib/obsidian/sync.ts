import fs from 'fs/promises';
import path from 'path';
import { db } from '@/db';
import { mainClaims, macroTheses, assetViews, underlyings } from '@/db/schema';
import type { MainClaim, MacroThesis, AssetView } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  parseMarkdown,
  generateMarkdownFile,
  generateFilepath,
  type ObsidianFrontmatter,
} from './markdown';

export interface SyncResult {
  success: boolean;
  action: 'created' | 'updated' | 'skipped' | 'conflict';
  entityType: 'main_claim' | 'macro_thesis' | 'asset_view';
  entityId?: string;
  filePath?: string;
  error?: string;
}

/**
 * Sync a single Obsidian file to the database
 */
export async function syncFileToDatabase(
  filePath: string,
  operation: 'create' | 'update' | 'delete'
): Promise<SyncResult> {
  try {
    // Handle deletions
    if (operation === 'delete') {
      // Extract ID from filename or content if possible
      // For now, skip delete handling
      return {
        success: true,
        action: 'skipped',
        entityType: 'main_claim',
        filePath,
        error: 'Delete operations not yet implemented',
      };
    }

    // Read and parse file
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, content: markdownContent, wikiLinks } = parseMarkdown(content);

    // Determine entity type
    const entityType = frontmatter.type;

    if (!entityType || !['main_claim', 'macro_thesis', 'asset_view'].includes(entityType)) {
      return {
        success: false,
        action: 'skipped',
        entityType: 'main_claim',
        filePath,
        error: `Invalid or missing entity type: ${entityType}`,
      };
    }

    // Check for conflicts (both modified since last sync)
    const fileModifiedAt = new Date(frontmatter.updated_at);
    const lastSyncedAt = frontmatter.last_synced_at ? new Date(frontmatter.last_synced_at) : null;

    // Sync based on entity type
    if (entityType === 'main_claim') {
      return await syncMainClaimToDatabase(frontmatter, markdownContent, filePath, operation);
    } else if (entityType === 'macro_thesis') {
      return await syncMacroThesisToDatabase(frontmatter, markdownContent, filePath, operation);
    } else if (entityType === 'asset_view') {
      return await syncAssetViewToDatabase(frontmatter, markdownContent, filePath, operation);
    }

    return {
      success: false,
      action: 'skipped',
      entityType,
      filePath,
      error: 'Unknown entity type',
    };
  } catch (error) {
    return {
      success: false,
      action: 'skipped',
      entityType: 'main_claim',
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sync main claim from file to database
 */
async function syncMainClaimToDatabase(
  frontmatter: ObsidianFrontmatter,
  content: string,
  filePath: string,
  operation: 'create' | 'update'
): Promise<SyncResult> {
  try {
    const existingId = frontmatter.id;

    // Parse Toulmin sections from markdown
    const sections = parseMainClaimSections(content);

    const claimData = {
      title: sections.title || frontmatter.id,
      category: (frontmatter.category || 'macro') as 'macro' | 'asset_specific',
      claim: sections.claim || '',
      evidence: sections.evidence || null,
      reasoning: sections.reasoning || null,
      backing: sections.backing || null,
      qualifier: (frontmatter.confidence as any) || null,
      rebuttal: sections.rebuttal || null,
      timeHorizon: (frontmatter.time_horizon as any) || null,
      relevantTickers: null,
      status: (frontmatter.status || 'active') as 'active' | 'invalidated' | 'merged',
      confidenceEvolution: null,
    };

    if (operation === 'create' || !existingId) {
      // Create new main claim
      const [created] = await db
        .insert(mainClaims)
        .values(claimData)
        .returning();

      // Update file with generated ID
      const newFrontmatter = { ...frontmatter, id: created.id, last_synced_at: new Date().toISOString() };
      const newContent = require('gray-matter').stringify(content, newFrontmatter);
      await fs.writeFile(filePath, newContent, 'utf-8');

      return {
        success: true,
        action: 'created',
        entityType: 'main_claim',
        entityId: created.id,
        filePath,
      };
    } else {
      // Check if exists in database
      const [existing] = await db
        .select()
        .from(mainClaims)
        .where(eq(mainClaims.id, existingId))
        .limit(1);

      if (!existing) {
        // ID in frontmatter but not in DB - create it
        const [created] = await db
          .insert(mainClaims)
          .values({
            id: existingId,
            ...claimData,
          })
          .returning();

        return {
          success: true,
          action: 'created',
          entityType: 'main_claim',
          entityId: created.id,
          filePath,
        };
      }

      // Check for conflicts
      const dbModifiedAt = new Date(existing.updatedAt);
      const fileModifiedAt = new Date(frontmatter.updated_at);
      const lastSyncedAt = frontmatter.last_synced_at ? new Date(frontmatter.last_synced_at) : null;

      if (lastSyncedAt && dbModifiedAt > lastSyncedAt && fileModifiedAt > lastSyncedAt) {
        // Both modified since last sync - conflict
        return {
          success: false,
          action: 'conflict',
          entityType: 'main_claim',
          entityId: existingId,
          filePath,
          error: 'Both database and file modified since last sync',
        };
      }

      // Update existing
      await db
        .update(mainClaims)
        .set(claimData)
        .where(eq(mainClaims.id, existingId));

      return {
        success: true,
        action: 'updated',
        entityType: 'main_claim',
        entityId: existingId,
        filePath,
      };
    }
  } catch (error) {
    return {
      success: false,
      action: 'skipped',
      entityType: 'main_claim',
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sync macro thesis from file to database
 */
async function syncMacroThesisToDatabase(
  frontmatter: ObsidianFrontmatter,
  content: string,
  filePath: string,
  operation: 'create' | 'update'
): Promise<SyncResult> {
  try {
    const existingId = frontmatter.id;
    const sections = parseMacroThesisSections(content);

    const thesisData = {
      title: sections.title || frontmatter.id,
      description: sections.description || '',
      thesisType: (frontmatter.thesis_type || 'secular') as any,
      sectors: frontmatter.sectors || null,
      direction: frontmatter.direction as any,
      positionStartDate: frontmatter.position_start_date || new Date().toISOString().split('T')[0],
      positionEndDate: frontmatter.position_end_date || new Date().toISOString().split('T')[0],
      outcome: (frontmatter.outcome as any) || null,
      outcomeNotes: null,
      actualOutcomeDate: null,
      timeHorizon: 'long_term' as any,
      confidenceLevel: (frontmatter.confidence_level || 'medium') as any,
      status: 'active' as any,
      notes: sections.notes || null,
    };

    if (operation === 'create' || !existingId) {
      const [created] = await db
        .insert(macroTheses)
        .values(thesisData)
        .returning();

      const newFrontmatter = { ...frontmatter, id: created.id, last_synced_at: new Date().toISOString() };
      const newContent = require('gray-matter').stringify(content, newFrontmatter);
      await fs.writeFile(filePath, newContent, 'utf-8');

      return {
        success: true,
        action: 'created',
        entityType: 'macro_thesis',
        entityId: created.id,
        filePath,
      };
    } else {
      const [existing] = await db
        .select()
        .from(macroTheses)
        .where(eq(macroTheses.id, existingId))
        .limit(1);

      if (!existing) {
        const [created] = await db
          .insert(macroTheses)
          .values({
            id: existingId,
            ...thesisData,
          })
          .returning();

        return {
          success: true,
          action: 'created',
          entityType: 'macro_thesis',
          entityId: created.id,
          filePath,
        };
      }

      await db
        .update(macroTheses)
        .set(thesisData)
        .where(eq(macroTheses.id, existingId));

      return {
        success: true,
        action: 'updated',
        entityType: 'macro_thesis',
        entityId: existingId,
        filePath,
      };
    }
  } catch (error) {
    return {
      success: false,
      action: 'skipped',
      entityType: 'macro_thesis',
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sync asset view from file to database
 */
async function syncAssetViewToDatabase(
  frontmatter: ObsidianFrontmatter,
  content: string,
  filePath: string,
  operation: 'create' | 'update'
): Promise<SyncResult> {
  try {
    const existingId = frontmatter.id;
    const sections = parseAssetViewSections(content);

    // Resolve ticker to underlying_id
    const ticker = frontmatter.ticker || sections.ticker;
    if (!ticker) {
      return {
        success: false,
        action: 'skipped',
        entityType: 'asset_view',
        filePath,
        error: 'Missing ticker in frontmatter',
      };
    }

    let [underlying] = await db
      .select()
      .from(underlyings)
      .where(eq(underlyings.ticker, ticker))
      .limit(1);

    if (!underlying) {
      // Create underlying
      [underlying] = await db
        .insert(underlyings)
        .values({
          ticker,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    }

    const viewData = {
      underlyingId: underlying.id,
      title: sections.title || frontmatter.id,
      description: sections.description || '',
      narrative: sections.narrative || null,
      fundamentalContext: sections.fundamentalContext || null,
      positioningContext: sections.positioningContext || null,
      regimeContext: sections.regimeContext || null,
      direction: frontmatter.direction as any,
      positionStartDate: frontmatter.position_start_date || new Date().toISOString().split('T')[0],
      positionEndDate: frontmatter.position_end_date || new Date().toISOString().split('T')[0],
      targetPrice: frontmatter.target_price ? String(frontmatter.target_price) : null,
      entryReferencePrice: frontmatter.entry_reference_price ? String(frontmatter.entry_reference_price) : null,
      outcome: (frontmatter.outcome as any) || null,
      outcomeNotes: null,
      actualOutcomeDate: frontmatter.actual_outcome_date || null,
      actualPrice: frontmatter.actual_price ? String(frontmatter.actual_price) : null,
      timeHorizon: 'long_term' as any,
      confidenceLevel: (frontmatter.confidence_level || 'medium') as any,
      status: 'active' as any,
      notes: sections.notes || null,
    };

    if (operation === 'create' || !existingId) {
      const [created] = await db
        .insert(assetViews)
        .values(viewData)
        .returning();

      const newFrontmatter = { ...frontmatter, id: created.id, last_synced_at: new Date().toISOString() };
      const newContent = require('gray-matter').stringify(content, newFrontmatter);
      await fs.writeFile(filePath, newContent, 'utf-8');

      return {
        success: true,
        action: 'created',
        entityType: 'asset_view',
        entityId: created.id,
        filePath,
      };
    } else {
      const [existing] = await db
        .select()
        .from(assetViews)
        .where(eq(assetViews.id, existingId))
        .limit(1);

      if (!existing) {
        const [created] = await db
          .insert(assetViews)
          .values({
            id: existingId,
            ...viewData,
          })
          .returning();

        return {
          success: true,
          action: 'created',
          entityType: 'asset_view',
          entityId: created.id,
          filePath,
        };
      }

      await db
        .update(assetViews)
        .set(viewData)
        .where(eq(assetViews.id, existingId));

      return {
        success: true,
        action: 'updated',
        entityType: 'asset_view',
        entityId: existingId,
        filePath,
      };
    }
  } catch (error) {
    return {
      success: false,
      action: 'skipped',
      entityType: 'asset_view',
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sync database entity to Obsidian file
 */
export async function syncDatabaseToFile(
  entity: MainClaim | MacroThesis | AssetView,
  type: 'main_claim' | 'macro_thesis' | 'asset_view',
  ticker?: string
): Promise<SyncResult> {
  try {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    if (!vaultPath) {
      return {
        success: false,
        action: 'skipped',
        entityType: type,
        error: 'OBSIDIAN_VAULT_PATH not configured',
      };
    }

    const filePath = generateFilepath(type, entity.title, vaultPath);

    // Check if file exists
    let existingContent: string | null = null;
    try {
      existingContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      // File doesn't exist - will create
    }

    if (existingContent) {
      const { frontmatter } = parseMarkdown(existingContent);

      // Check for conflicts
      const dbModifiedAt = new Date(entity.updatedAt);
      const fileModifiedAt = new Date(frontmatter.updated_at);
      const lastSyncedAt = frontmatter.last_synced_at ? new Date(frontmatter.last_synced_at) : null;

      if (lastSyncedAt && dbModifiedAt > lastSyncedAt && fileModifiedAt > lastSyncedAt) {
        return {
          success: false,
          action: 'conflict',
          entityType: type,
          entityId: entity.id,
          filePath,
          error: 'Both database and file modified since last sync',
        };
      }

      // Database is source of truth if DB was modified more recently
      if (fileModifiedAt > dbModifiedAt) {
        return {
          success: true,
          action: 'skipped',
          entityType: type,
          entityId: entity.id,
          filePath,
          error: 'File is newer than database - skipping',
        };
      }
    }

    // Generate markdown
    const markdownContent = generateMarkdownFile(entity, type, ticker);

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write file
    await fs.writeFile(filePath, markdownContent, 'utf-8');

    return {
      success: true,
      action: existingContent ? 'updated' : 'created',
      entityType: type,
      entityId: entity.id,
      filePath,
    };
  } catch (error) {
    return {
      success: false,
      action: 'skipped',
      entityType: type,
      entityId: entity.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Parse main claim sections from markdown content
 */
function parseMainClaimSections(content: string) {
  const sections: Record<string, string> = {};

  const titleMatch = content.match(/^#\s+(.+)$/m);
  sections.title = titleMatch ? titleMatch[1] : '';

  const claimMatch = content.match(/##\s+Claim\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.claim = claimMatch ? claimMatch[1].trim() : '';

  const evidenceMatch = content.match(/##\s+Evidence\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.evidence = evidenceMatch ? evidenceMatch[1].trim() : '';

  const reasoningMatch = content.match(/##\s+Reasoning\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.reasoning = reasoningMatch ? reasoningMatch[1].trim() : '';

  const backingMatch = content.match(/##\s+Backing\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.backing = backingMatch ? backingMatch[1].trim() : '';

  const rebuttalMatch = content.match(/##\s+Rebuttal\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.rebuttal = rebuttalMatch ? rebuttalMatch[1].trim() : '';

  return sections;
}

/**
 * Parse macro thesis sections from markdown content
 */
function parseMacroThesisSections(content: string) {
  const sections: Record<string, string> = {};

  const titleMatch = content.match(/^#\s+(.+)$/m);
  sections.title = titleMatch ? titleMatch[1] : '';

  const descriptionMatch = content.match(/##\s+Rationale\s+Summary\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.description = descriptionMatch ? descriptionMatch[1].trim() : '';

  const notesMatch = content.match(/##\s+Notes\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.notes = notesMatch ? notesMatch[1].trim() : '';

  return sections;
}

/**
 * Parse asset view sections from markdown content
 */
function parseAssetViewSections(content: string) {
  const sections: Record<string, string> = {};

  const titleMatch = content.match(/^#\s+(.+)$/m);
  sections.title = titleMatch ? titleMatch[1] : '';

  const tickerMatch = content.match(/\*\*Underlying\*\*:\s+(.+)$/m);
  sections.ticker = tickerMatch ? tickerMatch[1].trim() : '';

  const narrativeMatch = content.match(/##\s+Narrative\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.narrative = narrativeMatch ? narrativeMatch[1].trim() : '';

  const descriptionMatch = content.match(/##\s+Description\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.description = descriptionMatch ? descriptionMatch[1].trim() : '';

  const fundamentalMatch = content.match(/##\s+Fundamental\s+Context\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.fundamentalContext = fundamentalMatch ? fundamentalMatch[1].trim() : '';

  const positioningMatch = content.match(/##\s+Positioning\s+Context\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.positioningContext = positioningMatch ? positioningMatch[1].trim() : '';

  const regimeMatch = content.match(/##\s+Regime\s+Context\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.regimeContext = regimeMatch ? regimeMatch[1].trim() : '';

  const notesMatch = content.match(/##\s+Notes\s*\n([\s\S]*?)(?=\n##|$)/);
  sections.notes = notesMatch ? notesMatch[1].trim() : '';

  return sections;
}
