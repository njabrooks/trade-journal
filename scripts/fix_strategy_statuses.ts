/**
 * Fix strategy statuses based on latest snapshot date positions
 * 
 * This script recomputes the status for all strategies (or a specific one)
 * based on the new logic:
 * - "open" if has positions with quantity != 0 on latest snapshot
 * - "closed" if had positions before but none on latest snapshot
 * - "draft" if never had any positions
 * 
 * Usage:
 *   npx tsx scripts/fix_strategy_statuses.ts                    # Fix all strategies
 *   npx tsx scripts/fix_strategy_statuses.ts <strategyId>       # Fix specific strategy
 */

import { recomputeAllStrategyStatuses } from '../src/lib/services/strategies';

async function main() {
  const strategyId = process.argv[2]; // Optional strategy ID from command line

  console.log('Recomputing strategy statuses...');
  if (strategyId) {
    console.log(`Targeting strategy: ${strategyId}`);
  } else {
    console.log('Processing all strategies...');
  }

  try {
    const result = await recomputeAllStrategyStatuses(strategyId);

    console.log(`\n✅ Completed!`);
    console.log(`   Updated: ${result.updated} strategy(ies)`);
    
    if (result.results.length > 0) {
      console.log(`\nChanges:`);
      result.results.forEach(({ strategyId, oldStatus, newStatus }) => {
        console.log(`   ${strategyId}: ${oldStatus} → ${newStatus}`);
      });
    } else {
      console.log(`\n   No changes needed - all statuses are correct.`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

