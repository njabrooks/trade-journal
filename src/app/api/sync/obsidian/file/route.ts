import { NextRequest, NextResponse } from 'next/server';
import { syncFileToDatabase } from '@/lib/obsidian/sync';

/**
 * POST /api/sync/obsidian/file
 *
 * Syncs a single Obsidian file to the database.
 * Used by file watcher or manual sync.
 *
 * Request body:
 * {
 *   filePath: string;
 *   operation: 'create' | 'update' | 'delete';
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   result: SyncResult;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath, operation } = body;

    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing required field: filePath' },
        { status: 400 }
      );
    }

    if (!operation || !['create', 'update', 'delete'].includes(operation)) {
      return NextResponse.json(
        { error: 'Invalid operation. Must be: create, update, or delete' },
        { status: 400 }
      );
    }

    const syncEnabled = process.env.OBSIDIAN_SYNC_ENABLED === 'true';
    if (!syncEnabled) {
      return NextResponse.json(
        { error: 'Obsidian sync is not enabled. Set OBSIDIAN_SYNC_ENABLED=true in .env.local' },
        { status: 400 }
      );
    }

    const result = await syncFileToDatabase(filePath, operation);

    if (!result.success) {
      return NextResponse.json(
        { success: false, result, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
      message: `File ${operation}d successfully: ${result.action}`,
    });
  } catch (error: any) {
    console.error('Error syncing file:', error);
    return NextResponse.json(
      { error: 'Failed to sync file', details: error.message },
      { status: 500 }
    );
  }
}
