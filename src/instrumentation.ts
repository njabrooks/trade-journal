/**
 * Next.js instrumentation hook
 * Runs once when the server starts
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { obsidianWatcher } = await import('./lib/obsidian/watcher');

    const syncEnabled = process.env.OBSIDIAN_SYNC_ENABLED === 'true';
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;

    if (syncEnabled && vaultPath) {
      console.log('[Instrumentation] Starting Obsidian file watcher...');

      try {
        await obsidianWatcher.start({
          vaultPath,
          enabled: syncEnabled,
          debounceMs: 1000,
        });

        console.log('[Instrumentation] Obsidian file watcher started successfully');
      } catch (error) {
        console.error('[Instrumentation] Failed to start Obsidian file watcher:', error);
      }
    } else {
      console.log('[Instrumentation] Obsidian sync disabled or vault path not configured');
    }
  }
}
