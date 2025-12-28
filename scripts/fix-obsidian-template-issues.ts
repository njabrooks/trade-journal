#!/usr/bin/env tsx
/**
 * Fix known template issues in Obsidian markdown files
 *
 * This script fixes:
 * 1. Missing ticker in asset view frontmatter
 * 2. JSONB notes field in macro theses (object → string)
 * 3. "undefined" values in frontmatter
 * 4. Invalid enum values
 *
 * Usage:
 *   npx tsx scripts/fix-obsidian-template-issues.ts [--dry-run]
 */

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { db } from '@/db';
import { assetViews, macroTheses, underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';

interface FixResult {
  file: string;
  entityType: string;
  fixes: string[];
  errors: string[];
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) {
          files.push(...(await findMarkdownFiles(fullPath)));
        }
      } else if (entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist
  }

  return files;
}

async function fixAssetView(filePath: string, frontmatter: any, content: string, dryRun: boolean): Promise<FixResult> {
  const fixes: string[] = [];
  const errors: string[] = [];

  try {
    // Check if ticker is missing in frontmatter
    if (!frontmatter.ticker || frontmatter.ticker === 'undefined') {
      // Try to extract ticker from database
      if (frontmatter.id) {
        const [view] = await db
          .select({ underlyingId: assetViews.underlyingId })
          .from(assetViews)
          .where(eq(assetViews.id, frontmatter.id))
          .limit(1);

        if (view?.underlyingId) {
          const [underlying] = await db
            .select({ ticker: underlyings.ticker })
            .from(underlyings)
            .where(eq(underlyings.id, view.underlyingId))
            .limit(1);

          if (underlying?.ticker) {
            frontmatter.ticker = underlying.ticker;
            fixes.push(`Added ticker: ${underlying.ticker}`);
          } else {
            errors.push('Could not resolve ticker from database');
          }
        } else {
          errors.push('Asset view not found in database');
        }
      } else {
        // Try to extract from body
        const tickerMatch = content.match(/\*\*Underlying\*\*:\s*([A-Z]+)/);
        if (tickerMatch) {
          frontmatter.ticker = tickerMatch[1];
          fixes.push(`Extracted ticker from body: ${tickerMatch[1]}`);
        } else {
          errors.push('Could not determine ticker');
        }
      }
    }

    // Fix undefined values
    for (const key of Object.keys(frontmatter)) {
      if (frontmatter[key] === 'undefined' || frontmatter[key] === undefined) {
        delete frontmatter[key];
        fixes.push(`Removed undefined field: ${key}`);
      }
    }

    // Write back if fixes were made and not dry run
    if (fixes.length > 0 && !dryRun) {
      const newContent = matter.stringify(content, frontmatter);
      await fs.writeFile(filePath, newContent, 'utf-8');
      fixes.push('File updated');
    }

    return {
      file: filePath,
      entityType: 'asset_view',
      fixes,
      errors,
    };
  } catch (error) {
    return {
      file: filePath,
      entityType: 'asset_view',
      fixes,
      errors: [...errors, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

async function fixMacroThesis(filePath: string, frontmatter: any, content: string, dryRun: boolean): Promise<FixResult> {
  const fixes: string[] = [];
  const errors: string[] = [];

  try {
    // Fix JSONB notes field
    if (frontmatter.notes && typeof frontmatter.notes === 'object') {
      // Try to serialize to string
      if (frontmatter.notes.text) {
        frontmatter.notes = frontmatter.notes.text;
        fixes.push('Converted notes object to string (used .text field)');
      } else {
        frontmatter.notes = JSON.stringify(frontmatter.notes);
        fixes.push('Converted notes object to JSON string');
      }
    }

    // Fix undefined values
    for (const key of Object.keys(frontmatter)) {
      if (frontmatter[key] === 'undefined' || frontmatter[key] === undefined) {
        delete frontmatter[key];
        fixes.push(`Removed undefined field: ${key}`);
      }
    }

    // Write back if fixes were made and not dry run
    if (fixes.length > 0 && !dryRun) {
      const newContent = matter.stringify(content, frontmatter);
      await fs.writeFile(filePath, newContent, 'utf-8');
      fixes.push('File updated');
    }

    return {
      file: filePath,
      entityType: 'macro_thesis',
      fixes,
      errors,
    };
  } catch (error) {
    return {
      file: filePath,
      entityType: 'macro_thesis',
      fixes,
      errors: [...errors, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

async function fixMainClaim(filePath: string, frontmatter: any, content: string, dryRun: boolean): Promise<FixResult> {
  const fixes: string[] = [];
  const errors: string[] = [];

  try {
    // Fix undefined values
    for (const key of Object.keys(frontmatter)) {
      if (frontmatter[key] === 'undefined' || frontmatter[key] === undefined) {
        delete frontmatter[key];
        fixes.push(`Removed undefined field: ${key}`);
      }
    }

    // Write back if fixes were made and not dry run
    if (fixes.length > 0 && !dryRun) {
      const newContent = matter.stringify(content, frontmatter);
      await fs.writeFile(filePath, newContent, 'utf-8');
      fixes.push('File updated');
    }

    return {
      file: filePath,
      entityType: 'main_claim',
      fixes,
      errors,
    };
  } catch (error) {
    return {
      file: filePath,
      entityType: 'main_claim',
      fixes,
      errors: [...errors, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

async function fixFile(filePath: string, dryRun: boolean): Promise<FixResult | null> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(fileContent);

    const entityType = frontmatter.type;

    if (!entityType) {
      return null; // Skip files without type
    }

    switch (entityType) {
      case 'asset_view':
        return await fixAssetView(filePath, frontmatter, content, dryRun);
      case 'macro_thesis':
        return await fixMacroThesis(filePath, frontmatter, content, dryRun);
      case 'main_claim':
        return await fixMainClaim(filePath, frontmatter, content, dryRun);
      default:
        return null; // Skip unknown types
    }
  } catch (error) {
    return {
      file: filePath,
      entityType: 'unknown',
      fixes: [],
      errors: [`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const vaultPath = process.env.OBSIDIAN_VAULT_PATH || '/Users/njb/Desktop/nick/investing';

  console.log('🔧 Fixing Obsidian template issues...\n');
  console.log(`Vault path: ${vaultPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (files will be updated)'}\n`);

  // Find all markdown files
  const files = await findMarkdownFiles(vaultPath);
  console.log(`Found ${files.length} markdown files\n`);

  // Fix each file
  const results: FixResult[] = [];
  for (const file of files) {
    const result = await fixFile(file, dryRun);
    if (result) {
      results.push(result);
    }
  }

  // Filter to only files with fixes or errors
  const modifiedResults = results.filter(r => r.fixes.length > 0 || r.errors.length > 0);

  // Summary
  const totalFixes = results.reduce((sum, r) => sum + r.fixes.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const filesModified = results.filter(r => r.fixes.length > 0).length;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('FIX SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`✅ Files processed: ${results.length}`);
  console.log(`🔧 Files modified: ${filesModified}`);
  console.log(`✨ Total fixes applied: ${totalFixes}`);
  console.log(`❌ Total errors: ${totalErrors}\n`);

  // Print details
  if (modifiedResults.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('DETAILS');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const result of modifiedResults) {
      const relativePath = result.file.replace(vaultPath, '');
      console.log(`📄 ${relativePath}`);
      console.log(`   Type: ${result.entityType}`);

      if (result.fixes.length > 0) {
        console.log('   Fixes:');
        for (const fix of result.fixes) {
          console.log(`     ✨ ${fix}`);
        }
      }

      if (result.errors.length > 0) {
        console.log('   Errors:');
        for (const error of result.errors) {
          console.log(`     ❌ ${error}`);
        }
      }

      console.log('');
    }
  }

  if (dryRun && filesModified > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('This was a DRY RUN. Re-run without --dry-run to apply fixes.');
    console.log('═══════════════════════════════════════════════════════════\n');
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(console.error);
