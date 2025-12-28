#!/usr/bin/env tsx
/**
 * Fix template issues without database access
 *
 * This script fixes common template issues by extracting data from the markdown body:
 * 1. Missing ticker in asset view frontmatter (extracts from body)
 * 2. JSONB notes field issues
 * 3. "undefined" values
 *
 * Usage:
 *   npx tsx scripts/fix-obsidian-templates-simple.ts [--dry-run]
 */

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

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

async function fixFile(filePath: string, dryRun: boolean): Promise<FixResult> {
  const fixes: string[] = [];
  const errors: string[] = [];

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(fileContent);

    const entityType = frontmatter.type || 'unknown';
    let modified = false;

    // Fix asset view ticker
    if (entityType === 'asset_view') {
      if (!frontmatter.ticker || frontmatter.ticker === 'undefined') {
        // Try to extract from body first
        let tickerMatch = content.match(/\*\*Underlying\*\*:\s*([A-Z]+)/);

        // If not in body, try title (e.g., "Bullish TSLA" -> "TSLA")
        if (!tickerMatch) {
          const titleMatch = content.match(/^#\s+(?:Bullish|Bearish|Neutral)\s+([A-Z]{1,5})\b/m);
          if (titleMatch) {
            tickerMatch = titleMatch;
          }
        }

        // Try generic uppercase words in title
        if (!tickerMatch) {
          const genericMatch = content.match(/^#\s+.*?([A-Z]{2,5})\b/m);
          if (genericMatch) {
            tickerMatch = genericMatch;
          }
        }

        if (tickerMatch && tickerMatch[1]) {
          frontmatter.ticker = tickerMatch[1];
          fixes.push(`Added ticker: ${tickerMatch[1]}`);
          modified = true;
        } else {
          errors.push('Could not extract ticker (try adding manually)');
        }
      }
    }

    // Fix macro thesis notes
    if (entityType === 'macro_thesis') {
      if (frontmatter.notes && typeof frontmatter.notes === 'object') {
        // Convert object to string
        if (frontmatter.notes.text) {
          frontmatter.notes = frontmatter.notes.text;
          fixes.push('Converted notes object to string (used .text field)');
        } else {
          frontmatter.notes = JSON.stringify(frontmatter.notes);
          fixes.push('Converted notes object to JSON string');
        }
        modified = true;
      }
    }

    // Fix undefined values in frontmatter
    const undefinedKeys: string[] = [];
    for (const key of Object.keys(frontmatter)) {
      if (frontmatter[key] === 'undefined' || frontmatter[key] === undefined) {
        undefinedKeys.push(key);
        delete frontmatter[key];
      }
    }

    if (undefinedKeys.length > 0) {
      fixes.push(`Removed undefined fields: ${undefinedKeys.join(', ')}`);
      modified = true;
    }

    // Write back if modified and not dry run
    if (modified && !dryRun) {
      const newContent = matter.stringify(content, frontmatter);
      await fs.writeFile(filePath, newContent, 'utf-8');
      fixes.push('✅ File updated');
    } else if (modified && dryRun) {
      fixes.push('📝 Would update file (dry run)');
    }

    return {
      file: filePath,
      entityType,
      fixes,
      errors,
    };
  } catch (error) {
    return {
      file: filePath,
      entityType: 'unknown',
      fixes,
      errors: [`Failed to process: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const vaultPath = process.env.OBSIDIAN_VAULT_PATH || '/Users/njb/Desktop/nick/investing';

  console.log('🔧 Fixing Obsidian template issues...\n');
  console.log(`Vault path: ${vaultPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (files will be updated)'}\n`);

  // Find all markdown files
  const files = await findMarkdownFiles(vaultPath);
  console.log(`Found ${files.length} markdown files\n`);

  // Fix each file
  const results: FixResult[] = [];
  for (const file of files) {
    const result = await fixFile(file, dryRun);
    if (result.fixes.length > 0 || result.errors.length > 0) {
      results.push(result);
    }
  }

  // Summary
  const totalFixes = results.reduce((sum, r) => sum + r.fixes.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const filesModified = results.filter(r => r.fixes.length > 0).length;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('FIX SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`📊 Files processed: ${files.length}`);
  console.log(`🔧 Files with fixes: ${filesModified}`);
  console.log(`✨ Total fixes: ${totalFixes}`);
  console.log(`❌ Total errors: ${totalErrors}\n`);

  // Print details
  if (results.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('DETAILS');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const result of results) {
      const relativePath = result.file.replace(vaultPath, '');
      console.log(`📄 ${relativePath}`);
      console.log(`   Type: ${result.entityType}`);

      if (result.fixes.length > 0) {
        for (const fix of result.fixes) {
          console.log(`   ✨ ${fix}`);
        }
      }

      if (result.errors.length > 0) {
        for (const error of result.errors) {
          console.log(`   ❌ ${error}`);
        }
      }

      console.log('');
    }
  }

  if (dryRun && filesModified > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ℹ️  This was a DRY RUN. Re-run without --dry-run to apply fixes.');
    console.log('═══════════════════════════════════════════════════════════\n');
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(console.error);
