import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { mainClaims, macroTheses, assetTheses, underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { syncDatabaseToFile, type SyncResult } from '@/lib/obsidian/sync';

/**
 * POST /api/sync/database/to-obsidian
 *
 * Syncs database entities to Obsidian markdown files.
 * Can sync a single entity or all entities of a type.
 *
 * Request body:
 * {
 *   entityType?: 'main_claim' | 'macro_thesis' | 'asset_view';  // Optional: sync all of this type
 *   entityId?: string;  // Optional: sync specific entity
 *   syncAll?: boolean;  // Optional: sync all entities of all types
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   results: SyncResult[];
 *   summary: { ... };
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityType, entityId, syncAll } = body;

    const syncEnabled = process.env.OBSIDIAN_SYNC_ENABLED === 'true';
    if (!syncEnabled) {
      return NextResponse.json(
        { error: 'Obsidian sync is not enabled. Set OBSIDIAN_SYNC_ENABLED=true in .env.local' },
        { status: 400 }
      );
    }

    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    if (!vaultPath) {
      return NextResponse.json(
        { error: 'OBSIDIAN_VAULT_PATH not configured in .env.local' },
        { status: 500 }
      );
    }

    const results: SyncResult[] = [];

    // Sync specific entity
    if (entityId && entityType) {
      if (entityType === 'main_claim') {
        const [claim] = await db.select().from(mainClaims).where(eq(mainClaims.id, entityId)).limit(1);
        if (!claim) {
          return NextResponse.json({ error: 'Main claim not found' }, { status: 404 });
        }
        const result = await syncDatabaseToFile(claim, 'main_claim');
        results.push(result);
      } else if (entityType === 'macro_thesis') {
        const [thesis] = await db.select().from(macroTheses).where(eq(macroTheses.id, entityId)).limit(1);
        if (!thesis) {
          return NextResponse.json({ error: 'Macro thesis not found' }, { status: 404 });
        }
        const result = await syncDatabaseToFile(thesis as any, 'macro_thesis');
        results.push(result);
      } else if (entityType === 'asset_view') {
        const [view] = await db.select().from(assetTheses).where(eq(assetTheses.id, entityId)).limit(1);
        if (!view) {
          return NextResponse.json({ error: 'Asset view not found' }, { status: 404 });
        }

        // Get ticker for view
        let ticker: string | undefined;
        if (view.underlyingId) {
          const [underlying] = await db.select().from(underlyings).where(eq(underlyings.id, view.underlyingId)).limit(1);
          ticker = underlying?.ticker;
        }

        const result = await syncDatabaseToFile(view as any, 'asset_view', ticker);
        results.push(result);
      }
    }
    // Sync all entities of a type
    else if (entityType) {
      if (entityType === 'main_claim') {
        const claims = await db.select().from(mainClaims);
        for (const claim of claims) {
          const result = await syncDatabaseToFile(claim, 'main_claim');
          results.push(result);
        }
      } else if (entityType === 'macro_thesis') {
        const theses = await db.select().from(macroTheses);
        for (const thesis of theses) {
          const result = await syncDatabaseToFile(thesis as any, 'macro_thesis');
          results.push(result);
        }
      } else if (entityType === 'asset_view') {
        const views = await db.select().from(assetTheses);
        for (const view of views) {
          let ticker: string | undefined;
          if (view.underlyingId) {
            const [underlying] = await db.select().from(underlyings).where(eq(underlyings.id, view.underlyingId)).limit(1);
            ticker = underlying?.ticker;
          }
          const result = await syncDatabaseToFile(view as any, 'asset_view', ticker);
          results.push(result);
        }
      }
    }
    // Sync all entities
    else if (syncAll) {
      // Main claims
      const claims = await db.select().from(mainClaims);
      for (const claim of claims) {
        const result = await syncDatabaseToFile(claim, 'main_claim');
        results.push(result);
      }

      // Macro theses
      const theses = await db.select().from(macroTheses);
      for (const thesis of theses) {
        const result = await syncDatabaseToFile(thesis as any, 'macro_thesis');
        results.push(result);
      }

      // Asset views
      const views = await db.select().from(assetTheses);
      for (const view of views) {
        let ticker: string | undefined;
        if (view.underlyingId) {
          const [underlying] = await db.select().from(underlyings).where(eq(underlyings.id, view.underlyingId)).limit(1);
          ticker = underlying?.ticker;
        }
        const result = await syncDatabaseToFile(view as any, 'asset_view', ticker);
        results.push(result);
      }
    } else {
      return NextResponse.json(
        { error: 'Must provide entityType + entityId, entityType alone, or syncAll: true' },
        { status: 400 }
      );
    }

    // Generate summary
    const summary = {
      total: results.length,
      created: results.filter((r) => r.action === 'created').length,
      updated: results.filter((r) => r.action === 'updated').length,
      skipped: results.filter((r) => r.action === 'skipped').length,
      conflicts: results.filter((r) => r.action === 'conflict').length,
      errors: results.filter((r) => !r.success).length,
    };

    return NextResponse.json({
      success: true,
      results,
      summary,
      message: `Synced ${summary.total} entities: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.conflicts} conflicts, ${summary.errors} errors`,
    });
  } catch (error: any) {
    console.error('Error syncing database to Obsidian:', error);
    return NextResponse.json(
      { error: 'Failed to sync to Obsidian', details: error.message },
      { status: 500 }
    );
  }
}
