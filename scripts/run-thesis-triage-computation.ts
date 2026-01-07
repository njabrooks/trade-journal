/**
 * Run Thesis Triage Computation
 *
 * Generates lifecycle-based triage records for all active theses.
 * Creates:
 * - thesis_needs_articulation: for theses without articulations
 * - thesis_new_claims_available: for theses with ≥3 claims since last articulation
 */

import { db, closeDb } from './lib/db.js';
import { computeThesisTriageForAll } from '../src/lib/derived/thesisTriage.js';

async function main() {
  console.log('Running thesis triage computation for all active theses...\n');

  try {
    const results = await computeThesisTriageForAll();

    // Summary
    console.log('\n=== Summary ===');
    console.log(`Macro theses processed: ${results.macro.length}`);
    console.log(`Asset theses processed: ${results.asset.length}`);

    // Macro theses details
    const macroCreated = results.macro.filter((r) => r.triageCreated);
    const macroResolved = results.macro.filter((r) => r.existingTriageResolved);
    console.log(`\nMacro Theses:`);
    console.log(`  - Triage records created: ${macroCreated.length}`);
    if (macroCreated.length > 0) {
      for (const r of macroCreated) {
        console.log(`    * ${r.thesisId}: ${r.triageCreated}`);
      }
    }
    console.log(`  - Existing triage resolved: ${macroResolved.length}`);

    // Asset theses details
    const assetCreated = results.asset.filter((r) => r.triageCreated);
    const assetResolved = results.asset.filter((r) => r.existingTriageResolved);
    console.log(`\nAsset Theses:`);
    console.log(`  - Triage records created: ${assetCreated.length}`);
    if (assetCreated.length > 0) {
      for (const r of assetCreated) {
        console.log(`    * ${r.thesisId}: ${r.triageCreated}`);
      }
    }
    console.log(`  - Existing triage resolved: ${assetResolved.length}`);

    console.log('\nDone!');
  } catch (error) {
    console.error('Error running thesis triage computation:', error);
    throw error;
  } finally {
    await closeDb();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
