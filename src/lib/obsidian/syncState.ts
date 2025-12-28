import fs from 'fs/promises';
import path from 'path';

/**
 * Sync state cache to track file paths to entity IDs
 * This allows us to handle deletions when we can't read the file anymore
 */

interface SyncStateEntry {
  id: string;
  type: 'main_claim' | 'macro_thesis' | 'asset_view';
  lastSynced: string; // ISO timestamp
}

interface SyncState {
  [filePath: string]: SyncStateEntry;
}

class SyncStateCache {
  private state: SyncState = {};
  private stateFilePath: string;
  private loaded = false;

  constructor() {
    // Store sync state in .obsidian-sync-state.json in project root
    this.stateFilePath = path.join(process.cwd(), '.obsidian-sync-state.json');
  }

  /**
   * Load sync state from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      this.state = JSON.parse(data);
      this.loaded = true;
      console.log(`Loaded sync state: ${Object.keys(this.state).length} entries`);
    } catch (error) {
      // File doesn't exist yet, start with empty state
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.state = {};
        this.loaded = true;
        console.log('No sync state file found, starting fresh');
      } else {
        console.error('Error loading sync state:', error);
        throw error;
      }
    }
  }

  /**
   * Save sync state to disk
   */
  async save(): Promise<void> {
    try {
      await fs.writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving sync state:', error);
      throw error;
    }
  }

  /**
   * Track a synced file
   */
  async track(
    filePath: string,
    id: string,
    type: 'main_claim' | 'macro_thesis' | 'asset_view'
  ): Promise<void> {
    await this.load();

    this.state[filePath] = {
      id,
      type,
      lastSynced: new Date().toISOString(),
    };

    await this.save();
  }

  /**
   * Get entity info for a file path
   */
  async get(filePath: string): Promise<SyncStateEntry | null> {
    await this.load();
    return this.state[filePath] || null;
  }

  /**
   * Remove a file from tracking (after successful delete)
   */
  async untrack(filePath: string): Promise<void> {
    await this.load();

    if (this.state[filePath]) {
      delete this.state[filePath];
      await this.save();
    }
  }

  /**
   * Get all tracked files
   */
  async getAll(): Promise<SyncState> {
    await this.load();
    return { ...this.state };
  }

  /**
   * Clear all state (for testing)
   */
  async clear(): Promise<void> {
    this.state = {};
    await this.save();
  }
}

// Singleton instance
export const syncStateCache = new SyncStateCache();
