#!/usr/bin/env npx tsx

/**
 * Backfill Auto-Generated Titles for Asset Thesiss
 *
 * This script updates existing asset thesiss to use auto-generated titles
 * based on their structured fields (direction, ticker, time horizon).
 *
 * Part of Phase 2.6.3: Auto-Generated Titles
 *
 * Usage:
 *   npx tsx scripts/backfill-asset-view-titles.ts [--dry-run] [--force]
 *
 * Options:
 *   --dry-run   Show what would be updated without making changes
 *   --force     Update titles even if they don't match the auto-generated format
 */

import { db } from '@/db';
import { assetTheses, underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateAssetThesisTitle, type Direction, type TimeHorizon } from '@/lib/utils/title-generation';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const forceUpdate = args.includes('--force');

interface AssetThesisWithTicker {
  id: string;
  title: string;
  direction: Direction;
  timeHorizon: TimeHorizon;
  underlyingId: string | null;
  ticker: string | null;
}

async function main() {
  console.log('🔄 Backfilling Asset Thesis Titles...\n');

  if (isDryRun) {
    console.log('📋 DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Fetch all asset thesiss with their underlying tickers
    const views = await db
      .select({
        id: assetTheses.id,
        title: assetTheses.title,
        direction: assetTheses.direction,
        timeHorizon: assetTheses.timeHorizon,
        underlyingId: assetTheses.underlyingId,
        ticker: underlyings.ticker,
      })
      .from(assetTheses)
      .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
      .orderBy(assetTheses.createdAt);

    console.log(`📊 Found ${views.length} asset thesiss\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const view of views) {
      const viewData = view as AssetThesisWithTicker;

      // Skip if no ticker (can't generate meaningful title)
      if (!viewData.ticker) {
        console.log(`⚠️  Skipping "${viewData.title}" - No underlying ticker`);
        skippedCount++;
        continue;
      }

      // Generate the expected title
      const generatedTitle = generateAssetThesisTitle({
        direction: viewData.direction,
        ticker: viewData.ticker,
        timeHorizon: viewData.timeHorizon,
      });

      // Check if title needs updating
      const needsUpdate = viewData.title !== generatedTitle;

      if (!needsUpdate && !forceUpdate) {
        console.log(`✓ "${viewData.title}" - Already matches auto-generated format`);
        skippedCount++;
        continue;
      }

      if (needsUpdate) {
        console.log(`\n📝 Updating Asset Thesis:`);
        console.log(`   Current:   "${viewData.title}"`);
        console.log(`   Generated: "${generatedTitle}"`);
        console.log(`   Fields:    ${viewData.direction || 'none'} | ${viewData.ticker} | ${viewData.timeHorizon || 'none'}`);

        if (!isDryRun) {
          try {
            await db
              .update(assetTheses)
              .set({
                title: generatedTitle,
                updatedAt: new Date(),
              })
              .where(eq(assetTheses.id, viewData.id));

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
    console.log(`Total views:     ${views.length}`);
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
