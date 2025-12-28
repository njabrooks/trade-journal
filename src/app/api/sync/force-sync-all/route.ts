import { NextResponse } from 'next/server';
import { db } from '@/db';
import { mainClaims, macroTheses, assetViews } from '@/db/schema';
import { syncDatabaseToFile } from '@/lib/obsidian/sync';

/**
 * POST /api/sync/force-sync-all
 *
 * Force sync all entities from database to Obsidian files
 * Useful for recovering from sync issues or initial setup
 */
export async function POST() {
  try {
    const results = {
      mainClaims: { success: 0, failed: 0, errors: [] as string[] },
      macroTheses: { success: 0, failed: 0, errors: [] as string[] },
      assetViews: { success: 0, failed: 0, errors: [] as string[] },
    };

    // Sync all main claims
    const claims = await db.select().from(mainClaims);
    for (const claim of claims) {
      const result = await syncDatabaseToFile(claim, 'main_claim');
      if (result.success) {
        results.mainClaims.success++;
      } else {
        results.mainClaims.failed++;
        results.mainClaims.errors.push(`${claim.id}: ${result.error}`);
      }
    }

    // Sync all macro theses
    const theses = await db.select().from(macroTheses);
    for (const thesis of theses) {
      const result = await syncDatabaseToFile(thesis, 'macro_thesis');
      if (result.success) {
        results.macroTheses.success++;
      } else {
        results.macroTheses.failed++;
        results.macroTheses.errors.push(`${thesis.id}: ${result.error}`);
      }
    }

    // Sync all asset views
    const views = await db.select().from(assetViews);
    for (const view of views) {
      const result = await syncDatabaseToFile(view, 'asset_view');
      if (result.success) {
        results.assetViews.success++;
      } else {
        results.assetViews.failed++;
        results.assetViews.errors.push(`${view.id}: ${result.error}`);
      }
    }

    return NextResponse.json({
      success: true,
      results,
      summary: {
        totalSynced: results.mainClaims.success + results.macroTheses.success + results.assetViews.success,
        totalFailed: results.mainClaims.failed + results.macroTheses.failed + results.assetViews.failed,
      },
    });
  } catch (error: any) {
    console.error('Error forcing sync:', error);
    return NextResponse.json(
      { error: 'Failed to force sync', details: error.message },
      { status: 500 }
    );
  }
}
