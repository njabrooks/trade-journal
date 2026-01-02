/**
 * Repair script: Fix QUANTITY_CHANGE blotter actions that only matched to ONE trade
 * instead of ALL trades for the strategy.
 *
 * This script finds QUANTITY_CHANGE actions that are incompletely matched and
 * re-runs the matching logic with conid=null to match ALL trades.
 *
 * Usage: npx tsx scripts/repair-quantity-change-matching.ts [--dry-run]
 */

// Load .env.local BEFORE any imports
import { config } from 'dotenv';
import { resolve } from 'path';
const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath, override: false });

import { db } from '@/db';
import { blotterActions } from '@/db/schema';
import { eq, and, sql, isNotNull } from 'drizzle-orm';
import { matchTriageActionToTradeBlotter } from '@/lib/derived/blotter';

const isDryRun = process.argv.includes('--dry-run');

async function repairQuantityChangeMatching() {
  console.log('🔍 Finding QUANTITY_CHANGE blotter actions...\n');

  // Find QUANTITY_CHANGE blotter actions from triage_action source
  // These are the actions created when users process QUANTITY_CHANGE triage records
  const quantityChangeActions = await db
    .select({
      id: blotterActions.id,
      blotterId: blotterActions.blotterId,
      actionDate: blotterActions.actionDate,
      strategyId: blotterActions.strategyId,
      ticker: blotterActions.ticker,
      conid: blotterActions.conid,
      linkedBlotterActionId: blotterActions.linkedBlotterActionId,
      linkedTradeBlotterIds: blotterActions.linkedTradeBlotterIds,
      notes: blotterActions.notes,
    })
    .from(blotterActions)
    .where(
      and(
        eq(blotterActions.reasonCode, 'QUANTITY_CHANGE'),
        eq(blotterActions.source, 'triage_action'),
        eq(blotterActions.actionClass, 'TRADE'),
        isNotNull(blotterActions.strategyId),
        isNotNull(blotterActions.actionDate)
      )
    );

  console.log(`Found ${quantityChangeActions.length} QUANTITY_CHANGE actions\n`);

  if (quantityChangeActions.length === 0) {
    console.log('✅ No QUANTITY_CHANGE actions found. Nothing to repair.');
    return;
  }

  let repairedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const action of quantityChangeActions) {
    try {
      // Parse notes to see if there were multiple unmatched trades
      let unmatchedTrades: Array<{ conid: number; ticker: string }> = [];
      if (action.notes) {
        try {
          const parsed = JSON.parse(action.notes as string);
          if (parsed.unmatchedTrades && Array.isArray(parsed.unmatchedTrades)) {
            unmatchedTrades = parsed.unmatchedTrades;
          }
        } catch (e) {
          // Notes might not be JSON, that's okay
        }
      }

      const linkedTradeIds = action.linkedTradeBlotterIds as string[] | null;
      const linkedCount = linkedTradeIds ? linkedTradeIds.length : 0;
      const unmatchedCount = unmatchedTrades.length;

      // Only repair if we have evidence of multiple trades but only matched to one
      if (unmatchedCount > 1 && linkedCount < unmatchedCount) {
        console.log(`\n📝 Action: ${action.blotterId}`);
        console.log(`   Strategy ID: ${action.strategyId}`);
        console.log(`   Date: ${action.actionDate}`);
        console.log(`   Unmatched trades: ${unmatchedCount}`);
        console.log(`   Currently linked: ${linkedCount}`);
        console.log(`   Missing links: ${unmatchedCount - linkedCount}`);

        if (unmatchedTrades.length > 0) {
          console.log(`   Positions: ${unmatchedTrades.map(t => t.ticker).join(', ')}`);
        }

        if (!isDryRun) {
          // Re-run matching with conid=null to match ALL trades
          await matchTriageActionToTradeBlotter(
            action.id,
            action.strategyId,
            action.ticker || '',
            null,  // ← Pass null to match ALL trades
            action.actionDate
          );

          // Fetch updated record to show results
          const updated = await db
            .select({
              linkedTradeBlotterIds: blotterActions.linkedTradeBlotterIds,
            })
            .from(blotterActions)
            .where(eq(blotterActions.id, action.id))
            .limit(1);

          const newLinkedIds = updated[0]?.linkedTradeBlotterIds as string[] | null;
          const newLinkedCount = newLinkedIds ? newLinkedIds.length : 0;

          console.log(`   ✅ Repaired! Now linked to ${newLinkedCount} trades`);
          repairedCount++;
        } else {
          console.log(`   [DRY RUN] Would repair this action`);
          repairedCount++;
        }
      } else {
        // Skip - either no evidence of multiple trades, or already fully matched
        if (unmatchedCount <= 1) {
          console.log(`\n⏭️  Skipping ${action.blotterId} - only ${unmatchedCount} trade(s)`);
        } else if (linkedCount >= unmatchedCount) {
          console.log(`\n⏭️  Skipping ${action.blotterId} - already fully matched (${linkedCount}/${unmatchedCount})`);
        }
        skippedCount++;
      }
    } catch (error) {
      console.error(`\n❌ Error processing ${action.blotterId}:`, error);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  console.log(`Total QUANTITY_CHANGE actions: ${quantityChangeActions.length}`);
  console.log(`${isDryRun ? 'Would repair' : 'Repaired'}: ${repairedCount}`);
  console.log(`Skipped (already correct): ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);

  if (isDryRun && repairedCount > 0) {
    console.log('\n💡 Run without --dry-run to apply the repairs');
  }
}

repairQuantityChangeMatching()
  .then(() => {
    console.log('\n✅ Repair script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Repair script failed:', error);
    process.exit(1);
  });
