/**
 * Unified Adapter Registry
 *
 * Single registry for all source adapters (IBKR, Koinly, Buxfer, Coinbase, etc.).
 * Provides:
 * - Factory pattern for adapter instantiation
 * - Auto-detection from filename and content
 * - Category and type filtering
 * - Metadata for UI display
 */

import type { EventSource } from "@/types/event-sourcing";
import type { SyncSourceAdapter } from "./base-adapter";

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Adapter category for grouping in UI
 */
export type AdapterCategory = "ibkr" | "crypto" | "other";

/**
 * Adapter type for filtering
 * - event: Produces CanonicalEvent[] (most adapters)
 * - specialized: Produces other data types (e.g., price data, snapshots)
 */
export type AdapterType = "event" | "specialized";

/**
 * Registry entry for an adapter
 */
export interface AdapterEntry {
  /** Unique adapter name (e.g., 'ibkr_trade', 'koinly') */
  name: EventSource;

  /** Human-readable description */
  description: string;

  /** Factory function to create adapter instance */
  factory: () => SyncSourceAdapter;

  /** Category for grouping (ibkr, crypto, other) */
  category: AdapterCategory;

  /** Type of adapter (event-producing vs specialized) */
  type: AdapterType;

  /** File name patterns for auto-detection */
  filePatterns?: RegExp[];

  /** CSV header patterns for content-based detection */
  headerPatterns?: string[];
}

/**
 * Auto-detection result
 */
export interface DetectionResult {
  /** Detected source name, or null if not detected */
  source: EventSource | null;

  /** Adapter instance if detected, or null */
  adapter: SyncSourceAdapter | null;

  /** Confidence level of detection */
  confidence: "high" | "medium" | "low" | "none";

  /** Reason for detection or failure */
  reason: string;
}

/**
 * Adapter info for display
 */
export interface AdapterInfo {
  name: EventSource;
  description: string;
  category: AdapterCategory;
  type: AdapterType;
  version: string;
}

// ============================================================================
// Unified Adapter Registry
// ============================================================================

/**
 * Unified registry for all source adapters.
 *
 * Usage:
 * ```typescript
 * import { adapterRegistry } from './unified-registry';
 * import { registerAllAdapters } from './register-adapters';
 *
 * // At app startup
 * registerAllAdapters();
 *
 * // Get adapter by name
 * const adapter = adapterRegistry.getAdapter('koinly');
 *
 * // Auto-detect from file
 * const { adapter, source } = adapterRegistry.autoDetect('koinly_export.csv', csvContent);
 * ```
 */
class AdapterRegistry {
  private registry = new Map<EventSource, AdapterEntry>();
  private initialized = false;

  // ============================================================================
  // Registration
  // ============================================================================

  /**
   * Register an adapter entry
   */
  register(entry: AdapterEntry): void {
    if (this.registry.has(entry.name)) {
      throw new Error(`Adapter already registered: ${entry.name}`);
    }
    this.registry.set(entry.name, entry);
  }

  /**
   * Mark registry as initialized (all adapters registered)
   */
  markInitialized(): void {
    this.initialized = true;
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Adapter Retrieval
  // ============================================================================

  /**
   * Get adapter by name (throws if not found)
   */
  getAdapter<TRaw = Record<string, string>>(
    name: EventSource
  ): SyncSourceAdapter<TRaw> {
    const entry = this.registry.get(name);
    if (!entry) {
      throw new Error(
        `Unknown adapter: ${name}. Available: ${this.getAvailableNames().join(", ")}`
      );
    }
    return entry.factory() as SyncSourceAdapter<TRaw>;
  }

  /**
   * Try to get adapter, return null if not found
   */
  tryGetAdapter<TRaw = Record<string, string>>(
    name: string
  ): SyncSourceAdapter<TRaw> | null {
    const entry = this.registry.get(name as EventSource);
    return entry ? (entry.factory() as SyncSourceAdapter<TRaw>) : null;
  }

  /**
   * Check if adapter exists
   */
  hasAdapter(name: string): boolean {
    return this.registry.has(name as EventSource);
  }

  /**
   * Get all available adapter names
   */
  getAvailableNames(): EventSource[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Get adapter entry (metadata only)
   */
  getEntry(name: EventSource): AdapterEntry | undefined {
    return this.registry.get(name);
  }

  // ============================================================================
  // Filtering
  // ============================================================================

  /**
   * Get adapters by category
   */
  getByCategory(category: AdapterCategory): AdapterEntry[] {
    return Array.from(this.registry.values()).filter(
      (e) => e.category === category
    );
  }

  /**
   * Get only event-producing adapters
   */
  getEventAdapters(): AdapterEntry[] {
    return Array.from(this.registry.values()).filter((e) => e.type === "event");
  }

  /**
   * Get only specialized adapters
   */
  getSpecializedAdapters(): AdapterEntry[] {
    return Array.from(this.registry.values()).filter(
      (e) => e.type === "specialized"
    );
  }

  // ============================================================================
  // Auto-Detection
  // ============================================================================

  /**
   * Detect adapter from filename
   */
  detectFromFilename(filename: string): EventSource | null {
    const lowerFilename = filename.toLowerCase();
    for (const [name, entry] of this.registry) {
      if (entry.filePatterns?.some((p) => p.test(lowerFilename))) {
        return name;
      }
    }
    return null;
  }

  /**
   * Detect adapter from CSV content headers
   */
  detectFromContent(csvContent: string): EventSource | null {
    const firstLines = csvContent.slice(0, 2000).toLowerCase();
    for (const [name, entry] of this.registry) {
      if (
        entry.headerPatterns &&
        entry.headerPatterns.length > 0 &&
        entry.headerPatterns.every((p) => firstLines.includes(p.toLowerCase()))
      ) {
        return name;
      }
    }
    return null;
  }

  /**
   * Auto-detect adapter from filename and/or content
   *
   * Detection order:
   * 1. Try filename patterns (high confidence)
   * 2. Try content header patterns (medium confidence)
   * 3. Return null if no match
   */
  autoDetect(
    filename: string | null,
    csvContent: string
  ): DetectionResult {
    // Try filename first (higher confidence)
    if (filename) {
      const fromFilename = this.detectFromFilename(filename);
      if (fromFilename) {
        return {
          source: fromFilename,
          adapter: this.getAdapter(fromFilename),
          confidence: "high",
          reason: `Matched filename pattern for ${fromFilename}`,
        };
      }
    }

    // Try content headers
    const fromContent = this.detectFromContent(csvContent);
    if (fromContent) {
      return {
        source: fromContent,
        adapter: this.getAdapter(fromContent),
        confidence: "medium",
        reason: `Matched header patterns for ${fromContent}`,
      };
    }

    // No match
    return {
      source: null,
      adapter: null,
      confidence: "none",
      reason: "No adapter matched filename or content patterns",
    };
  }

  // ============================================================================
  // Information
  // ============================================================================

  /**
   * Get info for all registered adapters
   */
  getInfo(): AdapterInfo[] {
    return Array.from(this.registry.values()).map((entry) => {
      // Create instance to get version
      const adapter = entry.factory();
      return {
        name: entry.name,
        description: entry.description,
        category: entry.category,
        type: entry.type,
        version: adapter.version,
      };
    });
  }

  /**
   * Get info for adapters in a category
   */
  getCategoryInfo(category: AdapterCategory): AdapterInfo[] {
    return this.getInfo().filter((info) => info.category === category);
  }

  // ============================================================================
  // Debug / Testing
  // ============================================================================

  /**
   * Clear all registrations (for testing)
   */
  clear(): void {
    this.registry.clear();
    this.initialized = false;
  }

  /**
   * Get registry size
   */
  get size(): number {
    return this.registry.size;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global adapter registry instance.
 * Use registerAllAdapters() at app startup to populate.
 */
export const adapterRegistry = new AdapterRegistry();

// Re-export class for testing
export { AdapterRegistry };
