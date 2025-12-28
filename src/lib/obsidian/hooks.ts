import { syncDatabaseToFile } from './sync';
import type { MainClaim, MacroThesis, AssetView } from '@/db/schema';
import { db } from '@/db';
import { underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Hook to sync database changes to Obsidian
 * Call this after successful database writes (create/update)
 */
export async function syncEntityToObsidian(
  entity: MainClaim | MacroThesis | AssetView,
  type: 'main_claim' | 'macro_thesis' | 'asset_view'
): Promise<void> {
  const syncEnabled = process.env.OBSIDIAN_SYNC_ENABLED === 'true';
  if (!syncEnabled) {
    return;
  }

  try {
    // Get ticker for asset views
    let ticker: string | undefined;
    if (type === 'asset_view') {
      const view = entity as AssetView;
      if (view.underlyingId) {
        const [underlying] = await db
          .select()
          .from(underlyings)
          .where(eq(underlyings.id, view.underlyingId))
          .limit(1);
        ticker = underlying?.ticker;
      }
    }

    const result = await syncDatabaseToFile(entity, type, ticker);

    if (result.success) {
      console.log(`[DB→Obsidian] Synced ${type} ${entity.id} to ${result.filePath}`);
    } else {
      console.error(`[DB→Obsidian] Failed to sync ${type} ${entity.id}:`, result.error);
    }
  } catch (error) {
    console.error(`[DB→Obsidian] Error syncing ${type} ${entity.id}:`, error);
  }
}

/**
 * Hook for after main claim is created/updated
 */
export async function afterMainClaimSave(claim: MainClaim): Promise<void> {
  await syncEntityToObsidian(claim, 'main_claim');
}

/**
 * Hook for after macro thesis is created/updated
 */
export async function afterMacroThesisSave(thesis: MacroThesis): Promise<void> {
  await syncEntityToObsidian(thesis, 'macro_thesis');
}

/**
 * Hook for after asset view is created/updated
 */
export async function afterAssetViewSave(view: AssetView): Promise<void> {
  await syncEntityToObsidian(view, 'asset_view');
}
