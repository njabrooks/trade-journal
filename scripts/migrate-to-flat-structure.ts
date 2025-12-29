#!/usr/bin/env tsx
/**
 * Migrate to flat directory structure
 *
 * Moves all files from nested folders to single investing/ folder
 * with type prefix in filename.
 *
 * Before:
 *   investing/main-claims/2025-12-28-claim-title.md
 *   investing/macro-theses/2025-12-28-thesis-title.md
 *   investing/asset-theses/2025-12-28-view-title.md
 *
 * After:
 *   investing/2025-12-28-main-claim-claim-title.md
 *   investing/2025-12-28-macro-thesis-thesis-title.md
 *   investing/2025-12-28-asset-view-view-title.md
 *
 * Usage:
 *   npx tsx scripts/migrate-to-flat-structure.ts [--dry-run]
 */

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

interface MigrationResult {
  oldPath: string;
  newPath: string;
  type: string;
  success: boolean;
  error?: string;
  skipped?: boolean;
}

// Mapping of folder names to type prefixes
const FOLDER_TO_TYPE: { [folder: string]: string } = {
  'main-claims': 'main-claim',
  'macro-theses': 'macro-thesis',
  'asset-theses': 'asset-view',
  'transcripts': 'transcript',
  'audits': 'audit',
  'syntheses': 'synthesis',
  'deep-dives': 'deep-dive',
};

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

async function migrateFile(
  filePath: string,
  targetDir: string,
  folderType: string,
  dryRun: boolean
): Promise<MigrationResult> {
  try {
    const filename = path.basename(filePath);

    // Check if already has type prefix
    const hasTypePrefix = Object.values(FOLDER_TO_TYPE).some(type =>
      filename.includes(`-${type}-`)
    );

    if (hasTypePrefix) {
      return {
        oldPath: filePath,
        newPath: filePath,
        type: folderType,
        success: true,
        skipped: true,
      };
    }

    // Read frontmatter to get created date
    const content = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter } = matter(content);

    // Extract date prefix if exists, or use created_at
    let datePrefix: string;
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
    if (dateMatch) {
      datePrefix = dateMatch[1];
    } else if (frontmatter.created_at) {
      const date = new Date(frontmatter.created_at);
      datePrefix = date.toISOString().split('T')[0];
    } else {
      datePrefix = new Date().toISOString().split('T')[0];
    }

    // Remove existing date prefix if present
    let baseFilename = filename;
    if (dateMatch) {
      baseFilename = filename.slice(11); // Remove "YYYY-MM-DD-"
    }

    // Generate new filename: YYYY-MM-DD-{type}-{title}.md
    const newFilename = `${datePrefix}-${folderType}-${baseFilename}`;
    const newPath = path.join(targetDir, newFilename);

    // Check if target file already exists
    try {
      await fs.access(newPath);
      return {
        oldPath: filePath,
        newPath,
        type: folderType,
        success: false,
        error: 'Target file already exists',
      };
    } catch {
      // File doesn't exist, proceed
    }

    // Perform move
    if (!dryRun) {
      await fs.rename(filePath, newPath);
    }

    return {
      oldPath: filePath,
      newPath,
      type: folderType,
      success: true,
    };
  } catch (error) {
    return {
      oldPath: filePath,
      newPath: filePath,
      type: folderType,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const vaultPath = process.env.OBSIDIAN_VAULT_PATH || '/Users/njb/Desktop/nick/investing';
  const targetDir = vaultPath; // Already points to investing/ folder

  console.log('📁 Migrating to flat directory structure...\n');
  console.log(`Vault path: ${vaultPath}`);
  console.log(`Target directory: ${targetDir}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (files will be moved)'}\n`);

  // Directories to migrate
  const directories = [
    { path: path.join(vaultPath, 'main-claims'), type: 'main-claim' },
    { path: path.join(vaultPath, 'macro-theses'), type: 'macro-thesis' },
    { path: path.join(vaultPath, 'asset-theses'), type: 'asset-view' },
    { path: path.join(vaultPath, 'research/transcripts'), type: 'transcript' },
    { path: path.join(vaultPath, 'research/audits'), type: 'audit' },
    { path: path.join(vaultPath, 'research/syntheses'), type: 'synthesis' },
    { path: path.join(vaultPath, 'research/deep-dives'), type: 'deep-dive' },
  ];

  const results: MigrationResult[] = [];

  for (const { path: dir, type } of directories) {
    const folderName = path.basename(dir);
    console.log(`Processing ${folderName}...`);

    const files = await findMarkdownFiles(dir);
    console.log(`  Found ${files.length} files`);

    for (const file of files) {
      const result = await migrateFile(file, targetDir, type, dryRun);
      results.push(result);
    }

    console.log('');
  }

  // Summary
  const moved = results.filter(r => r.success && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const errors = results.filter(r => !r.success).length;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('MIGRATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`✅ Files moved: ${moved}`);
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
        console.log(`   Already has type prefix\n`);
      } else if (result.success) {
        console.log(`✅ ${oldName}`);
        console.log(`   → ${newName}`);
        if (dryRun) {
          console.log(`   (would move - dry run)\n`);
        } else {
          console.log(`   (moved)\n`);
        }
      } else {
        console.log(`❌ ${oldName}`);
        console.log(`   Error: ${result.error}\n`);
      }
    }
  }

  if (dryRun && moved > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ℹ️  This was a DRY RUN. Re-run without --dry-run to apply migration.');
    console.log('═══════════════════════════════════════════════════════════\n');
  }

  // Cleanup instructions
  if (!dryRun && moved > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 NEXT STEPS');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('1. Verify files in investing/ folder');
    console.log('2. Delete empty nested folders:');
    console.log('   - main-claims/');
    console.log('   - macro-theses/');
    console.log('   - asset-theses/');
    console.log('   - research/transcripts/');
    console.log('   - research/audits/');
    console.log('   - research/syntheses/');
    console.log('   - research/deep-dives/');
    console.log('3. Clear sync state cache');
    console.log('4. Test file access in Obsidian\n');
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(console.error);
