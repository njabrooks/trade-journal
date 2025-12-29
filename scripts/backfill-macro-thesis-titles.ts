#!/usr/bin/env npx tsx

/**
 * Backfill Auto-Generated Titles for Macro Theses
 *
 * This script updates existing macro theses to use auto-generated titles
 * based on their structured fields (direction, sectors, time horizon).
 *
 * Part of Phase 2.6.3: Auto-Generated Titles
 *
 * Usage:
 *   npx tsx scripts/backfill-macro-thesis-titles.ts [--dry-run] [--force]
 *
 * Options:
 *   --dry-run   Show what would be updated without making changes
 *   --force     Update titles even if they don't match the auto-generated format
 */

import { db } from '@/db';
import { macroTheses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateMacroThesisTitle, type Direction, type TimeHorizon } from '@/lib/utils/title-generation';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const forceUpdate = args.includes('--force');

interface MacroThesisData {
  id: string;
  title: string;
  direction: Direction;
  timeHorizon: TimeHorizon;
  sectors: string[] | null;
}

async function main() {
  console.log('🔄 Backfilling Macro Thesis Titles...\n');

  if (isDryRun) {
    console.log('📋 DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Fetch all macro theses
    const theses = await db
      .select({
        id: macroTheses.id,
        title: macroTheses.title,
        direction: macroTheses.direction,
        timeHorizon: macroTheses.timeHorizon,
        sectors: macroTheses.sectors,
      })
      .from(macroTheses)
      .orderBy(macroTheses.createdAt);

    console.log(`📊 Found ${theses.length} macro theses\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const thesis of theses) {
      const thesisData = thesis as MacroThesisData;

      // Skip if no sectors (can't generate meaningful title)
      if (!thesisData.sectors || thesisData.sectors.length === 0) {
        console.log(`⚠️  Skipping "${thesisData.title}" - No sectors defined`);
        skippedCount++;
        continue;
      }

      // Generate the expected title
      const generatedTitle = generateMacroThesisTitle({
        direction: thesisData.direction,
        sectors: thesisData.sectors,
        timeHorizon: thesisData.timeHorizon,
      });

      // Check if title needs updating
      const needsUpdate = thesisData.title !== generatedTitle;

      if (!needsUpdate && !forceUpdate) {
        console.log(`✓ "${thesisData.title}" - Already matches auto-generated format`);
        skippedCount++;
        continue;
      }

      if (needsUpdate) {
        console.log(`\n📝 Updating Macro Thesis:`);
        console.log(`   Current:   "${thesisData.title}"`);
        console.log(`   Generated: "${generatedTitle}"`);
        console.log(`   Fields:    ${thesisData.direction || 'none'} | ${thesisData.sectors.join(', ')} | ${thesisData.timeHorizon || 'none'}`);

        if (!isDryRun) {
          try {
            await db
              .update(macroTheses)
              .set({
                title: generatedTitle,
                updatedAt: new Date(),
              })
              .where(eq(macroTheses.id, thesisData.id));

            console.log(`   ✅ Updated successfully`);
            updatedCount++;
          } catch (error) {
            console.error(`   ❌ Error updating:`, error);
            errorCount++;
          }
        } else {
          console.log(`   [DRY RUN] Would update`);
          updatedCount++;
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log('='.repeat(60));
    console.log(`Total theses:    ${theses.length}`);
    console.log(`Updated:         ${updatedCount}`);
    console.log(`Skipped:         ${skippedCount}`);
    console.log(`Errors:          ${errorCount}`);

    if (isDryRun) {
      console.log('\n💡 Run without --dry-run to apply changes');
    } else if (updatedCount > 0) {
      console.log('\n✅ Backfill complete!');
    } else {
      console.log('\n✓ No updates needed - all titles already match auto-generated format');
    }

  } catch (error) {
    console.error('\n❌ Fatal error during backfill:', error);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
