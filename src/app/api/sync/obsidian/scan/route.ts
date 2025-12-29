import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { syncFileToDatabase, type SyncResult } from '@/lib/obsidian/sync';

/**
 * GET /api/sync/obsidian/scan
 *
 * Scans the entire Obsidian vault and syncs all markdown files to the database.
 * Used for initial sync or periodic polling sync.
 *
 * Response:
 * {
 *   success: boolean;
 *   results: SyncResult[];
 *   summary: {
 *     total: number;
 *     created: number;
 *     updated: number;
 *     skipped: number;
 *     conflicts: number;
 *     errors: number;
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    const syncEnabled = process.env.OBSIDIAN_SYNC_ENABLED === 'true';

    if (!syncEnabled) {
      return NextResponse.json(
        { error: 'Obsidian sync is not enabled. Set OBSIDIAN_SYNC_ENABLED=true in .env.local' },
        { status: 400 }
      );
    }

    if (!vaultPath) {
      return NextResponse.json(
        { error: 'OBSIDIAN_VAULT_PATH not configured in .env.local' },
        { status: 500 }
      );
    }

    // Check if vault path exists
    try {
      await fs.access(vaultPath);
    } catch (error) {
      return NextResponse.json(
        { error: `Vault path does not exist: ${vaultPath}` },
        { status: 404 }
      );
    }

    // Scan the flat investing folder
    const investingPath = path.join(vaultPath, 'investing');
    const results: SyncResult[] = [];

    try {
      await fs.access(investingPath);
    } catch (error) {
      return NextResponse.json(
        { error: `Investing folder does not exist: ${investingPath}` },
        { status: 404 }
      );
    }

    // Read all .md files in flat structure
    const files = await fs.readdir(investingPath);
    const mdFiles = files.filter((f) =>
      f.endsWith('.md') &&
      (f.includes('-main-claim-') || f.includes('-macro-thesis-') || f.includes('-asset-thesis-'))
    );

    for (const file of mdFiles) {
      const filePath = path.join(investingPath, file);

      try {
        const result = await syncFileToDatabase(filePath, 'update');
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          action: 'skipped',
          entityType: 'main_claim',
          filePath,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
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
      message: `Scanned ${summary.total} files: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.conflicts} conflicts, ${summary.errors} errors`,
    });
  } catch (error: any) {
    console.error('Error scanning Obsidian vault:', error);
    return NextResponse.json(
      { error: 'Failed to scan vault', details: error.message },
      { status: 500 }
    );
  }
}
