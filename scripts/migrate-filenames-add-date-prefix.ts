#!/usr/bin/env tsx
/**
 * Migrate existing files to YYYY-MM-DD prefix naming convention
 *
 * This script:
 * 1. Scans main-claims, macro-theses, and asset-views directories
 * 2. Reads created_at from frontmatter
 * 3. Renames files to add YYYY-MM-DD prefix
 *
 * Usage:
 *   npx tsx scripts/migrate-filenames-add-date-prefix.ts [--dry-run]
 */

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

interface RenameResult {
  oldPath: string;
  newPath: string;
  success: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.'))
      .map(entry => path.join(dir, entry.name));
  } catch (error) {
    return [];
  }
}

async function migrateFile(filePath: string, dryRun: boolean): Promise<RenameResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter } = matter(content);

    const filename = path.basename(filePath);
    const dirname = path.dirname(filePath);

    // Check if already has date prefix (YYYY-MM-DD-)
    const hasDatePrefix = /^\d{4}-\d{2}-\d{2}-/.test(filename);
    if (hasDatePrefix) {
      return {
        oldPath: filePath,
        newPath: filePath,
        success: true,
        skipped: true,
        reason: 'Already has date prefix',
      };
    }

    // Extract date from frontmatter
    let dateStr: string;
    if (frontmatter.created_at) {
      const date = new Date(frontmatter.created_at);
      dateStr = date.toISOString().split('T')[0];
    } else {
      // Fallback to current date if no created_at
      dateStr = new Date().toISOString().split('T')[0];
    }

    // Generate new filename
    const newFilename = `${dateStr}-${filename}`;
    const newPath = path.join(dirname, newFilename);

    // Check if target file already exists
    try {
      await fs.access(newPath);
      return {
        oldPath: filePath,
        newPath,
        success: false,
        error: 'Target file already exists',
      };
    } catch {
      // File doesn't exist, proceed with rename
    }

    // Perform rename
    if (!dryRun) {
      await fs.rename(filePath, newPath);
    }

    return {
      oldPath: filePath,
      newPath,
      success: true,
    };
  } catch (error) {
    return {
      oldPath: filePath,
      newPath: filePath,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const vaultPath = process.env.OBSIDIAN_VAULT_PATH || '/Users/njb/Desktop/nick/investing';

  console.log('📝 Migrating filenames to YYYY-MM-DD prefix...\n');
  console.log(`Vault path: ${vaultPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (files will be renamed)'}\n`);

  // Directories to process
  const directories = [
    path.join(vaultPath, 'main-claims'),
    path.join(vaultPath, 'macro-theses'),
    path.join(vaultPath, 'asset-views'),
  ];

  const results: RenameResult[] = [];

  for (const dir of directories) {
    const dirName = path.basename(dir);
    console.log(`Processing ${dirName}...`);

    const files = await findMarkdownFiles(dir);
    console.log(`  Found ${files.length} files\n`);

    for (const file of files) {
      const result = await migrateFile(file, dryRun);
      results.push(result);
    }
  }

  // Summary
  const renamed = results.filter(r => r.success && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const errors = results.filter(r => !r.success).length;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('MIGRATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`✅ Files renamed: ${renamed}`);
  console.log(`⏭️  Files skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}\n`);

  // Print details
  if (results.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('DETAILS');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const result of results) {
      const oldName = path.basename(result.oldPath);
      const newName = path.basename(result.newPath);

      if (result.skipped) {
        console.log(`⏭️  ${oldName}`);
        console.log(`   ${result.reason}\n`);
      } else if (result.success) {
        console.log(`✅ ${oldName}`);
        console.log(`   → ${newName}`);
        if (dryRun) {
          console.log(`   (would rename - dry run)\n`);
        } else {
          console.log(`   (renamed)\n`);
        }
      } else {
        console.log(`❌ ${oldName}`);
        console.log(`   Error: ${result.error}\n`);
      }
    }
  }

  if (dryRun && renamed > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ℹ️  This was a DRY RUN. Re-run without --dry-run to apply renames.');
    console.log('═══════════════════════════════════════════════════════════\n');
  }

  // Update sync state warning
  if (!dryRun && renamed > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('⚠️  IMPORTANT: Sync State Cache');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('Files have been renamed, but the sync state cache still points to old paths.');
    console.log('You may need to:');
    console.log('1. Clear the sync state cache, OR');
    console.log('2. Re-sync all entities from the database\n');
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(console.error);
