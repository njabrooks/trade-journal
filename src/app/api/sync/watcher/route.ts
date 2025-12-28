import { NextRequest, NextResponse } from 'next/server';
import { obsidianWatcher } from '@/lib/obsidian/watcher';

/**
 * GET /api/sync/watcher
 * Get watcher status and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const stats = obsidianWatcher.getStats();
    const config = {
      vaultPath: process.env.OBSIDIAN_VAULT_PATH,
      enabled: process.env.OBSIDIAN_SYNC_ENABLED === 'true',
    };

    return NextResponse.json({
      success: true,
      stats,
      config,
    });
  } catch (error: any) {
    console.error('Error getting watcher stats:', error);
    return NextResponse.json(
      { error: 'Failed to get watcher stats', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync/watcher
 * Start or stop the file watcher
 *
 * Request body:
 * {
 *   action: 'start' | 'stop' | 'restart' | 'clear-stats';
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'Missing required field: action' },
        { status: 400 }
      );
    }

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

    switch (action) {
      case 'start':
        if (obsidianWatcher.isRunning()) {
          return NextResponse.json(
            { error: 'Watcher is already running' },
            { status: 400 }
          );
        }

        await obsidianWatcher.start({
          vaultPath,
          enabled: syncEnabled,
          debounceMs: 1000,
        });

        return NextResponse.json({
          success: true,
          message: 'Watcher started successfully',
          stats: obsidianWatcher.getStats(),
        });

      case 'stop':
        if (!obsidianWatcher.isRunning()) {
          return NextResponse.json(
            { error: 'Watcher is not running' },
            { status: 400 }
          );
        }

        await obsidianWatcher.stop();

        return NextResponse.json({
          success: true,
          message: 'Watcher stopped successfully',
          stats: obsidianWatcher.getStats(),
        });

      case 'restart':
        if (obsidianWatcher.isRunning()) {
          await obsidianWatcher.stop();
        }

        await obsidianWatcher.start({
          vaultPath,
          enabled: syncEnabled,
          debounceMs: 1000,
        });

        return NextResponse.json({
          success: true,
          message: 'Watcher restarted successfully',
          stats: obsidianWatcher.getStats(),
        });

      case 'clear-stats':
        obsidianWatcher.clearStats();

        return NextResponse.json({
          success: true,
          message: 'Statistics cleared',
          stats: obsidianWatcher.getStats(),
        });

      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}. Must be: start, stop, restart, or clear-stats` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Error controlling watcher:', error);
    return NextResponse.json(
      { error: 'Failed to control watcher', details: error.message },
      { status: 500 }
    );
  }
}
