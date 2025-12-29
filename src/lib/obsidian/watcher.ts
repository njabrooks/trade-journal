import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import { syncFileToDatabase } from './sync';

export interface WatcherConfig {
  vaultPath: string;
  enabled: boolean;
  debounceMs?: number;
}

export interface WatcherStats {
  isRunning: boolean;
  filesWatched: number;
  lastSync?: Date;
  errors: Array<{
    timestamp: Date;
    filePath: string;
    error: string;
  }>;
  syncs: Array<{
    timestamp: Date;
    filePath: string;
    action: 'created' | 'updated' | 'deleted' | 'skipped' | 'conflict';
    success: boolean;
  }>;
}

class ObsidianWatcher {
  private watcher: FSWatcher | null = null;
  private config: WatcherConfig | null = null;
  private stats: WatcherStats = {
    isRunning: false,
    filesWatched: 0,
    errors: [],
    syncs: [],
  };
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start watching Obsidian vault for changes
   */
  async start(config: WatcherConfig): Promise<void> {
    if (this.watcher) {
      console.log('Watcher already running');
      return;
    }

    if (!config.enabled) {
      console.log('Watcher disabled in config');
      return;
    }

    this.config = config;

    // Watch these folders for main claims, macro theses, and asset theses
    const watchPaths = [
      path.join(config.vaultPath, 'investing', 'main-claims'),
      path.join(config.vaultPath, 'investing', 'macro-theses'),
      path.join(config.vaultPath, 'investing', 'asset-theses'),
    ];

    console.log('Starting Obsidian file watcher...');
    console.log('Watching paths:', watchPaths);

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: false, // Process existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      ignored: [
        '**/.DS_Store',
        '**/node_modules/**',
        '**/.git/**',
        '**/.obsidian/**',
      ],
    });

    this.watcher
      .on('add', (filePath) => this.handleFileChange(filePath, 'create'))
      .on('change', (filePath) => this.handleFileChange(filePath, 'update'))
      .on('unlink', (filePath) => this.handleFileChange(filePath, 'delete'))
      .on('error', (error) => {
        console.error('Watcher error:', error);
        this.stats.errors.push({
          timestamp: new Date(),
          filePath: 'watcher',
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .on('ready', () => {
        const watchedPaths = this.watcher?.getWatched();
        const fileCount = watchedPaths
          ? Object.values(watchedPaths).reduce((sum, files) => sum + files.length, 0)
          : 0;

        this.stats.filesWatched = fileCount;
        this.stats.isRunning = true;
        console.log(`Watcher ready. Watching ${fileCount} files.`);
      });
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    console.log('Stopping Obsidian file watcher...');
    await this.watcher.close();
    this.watcher = null;
    this.stats.isRunning = false;
    console.log('Watcher stopped');
  }

  /**
   * Handle file change with debouncing
   */
  private handleFileChange(
    filePath: string,
    operation: 'create' | 'update' | 'delete'
  ): void {
    // Only sync .md files
    if (!filePath.endsWith('.md')) {
      return;
    }

    const debounceMs = this.config?.debounceMs || 1000;

    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.syncFile(filePath, operation);
      this.debounceTimers.delete(filePath);
    }, debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Sync file to database
   */
  private async syncFile(
    filePath: string,
    operation: 'create' | 'update' | 'delete'
  ): Promise<void> {
    console.log(`Syncing file: ${filePath} (${operation})`);

    try {
      const result = await syncFileToDatabase(filePath, operation);

      this.stats.syncs.push({
        timestamp: new Date(),
        filePath,
        action: result.action,
        success: result.success,
      });

      this.stats.lastSync = new Date();

      // Keep only last 100 syncs
      if (this.stats.syncs.length > 100) {
        this.stats.syncs = this.stats.syncs.slice(-100);
      }

      if (!result.success) {
        console.error(`Sync failed for ${filePath}:`, result.error);
        this.stats.errors.push({
          timestamp: new Date(),
          filePath,
          error: result.error || 'Unknown error',
        });

        // Keep only last 50 errors
        if (this.stats.errors.length > 50) {
          this.stats.errors = this.stats.errors.slice(-50);
        }
      } else {
        console.log(`Sync successful: ${filePath} → ${result.action}`);
      }
    } catch (error) {
      console.error(`Error syncing file ${filePath}:`, error);
      this.stats.errors.push({
        timestamp: new Date(),
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get watcher statistics
   */
  getStats(): WatcherStats {
    return {
      ...this.stats,
      // Return copies to prevent mutation
      errors: [...this.stats.errors],
      syncs: [...this.stats.syncs],
    };
  }

  /**
   * Clear statistics
   */
  clearStats(): void {
    this.stats.errors = [];
    this.stats.syncs = [];
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.stats.isRunning;
  }
}

// Singleton instance
export const obsidianWatcher = new ObsidianWatcher();
