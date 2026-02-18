import { createHash } from "crypto";
import { eventExistsByIdempotencyKey } from "@/db/queries/events";
import { getImportBatchByFileHash } from "@/db/queries/importBatches";
import type {
  SelectImportBatch,
  IdempotencyServiceInterface,
} from "@/types/event-sourcing";

// ============================================================================
// Idempotency Service
// ============================================================================

/**
 * IdempotencyService - Prevents duplicate imports and events
 *
 * Provides two levels of idempotency:
 * 1. File-level: Detects if an entire file has been imported before (via file hash)
 * 2. Record-level: Detects if a specific event has been created (via idempotency key)
 *
 * Idempotency Key Format:
 * - IBKR: `ibkr:{user_id}:{conid}:{timestamp}:{quantity}:{total_value}`
 * - Koinly: `koinly:{user_id}:{tx_hash}:{timestamp}`
 * - Buxfer: `buxfer:{user_id}:{transaction_id}`
 *
 * This ensures that:
 * - Re-uploading the same file is detected immediately
 * - Partial re-imports don't create duplicates
 * - Different sources can have their own key formats
 */
export class IdempotencyService implements IdempotencyServiceInterface {
  /**
   * Generate an idempotency key for a record
   *
   * The key format varies by source to capture the natural unique identifiers:
   * - IBKR: Uses conid + timestamp + quantity + value (trades don't have unique IDs)
   * - Koinly: Uses tx_hash when available, falls back to timestamp + amounts
   * - Buxfer: Uses transaction_id
   */
  generateKey(source: string, record: Record<string, unknown>): string {
    const parts: string[] = [source];

    switch (source.toLowerCase()) {
      case 'ibkr_trade':
      case 'ibkr_cash':
      case 'ibkr_position':
      case 'ibkr':
        parts.push(
          String(record.conid || record.symbol || ''),
          this.normalizeTimestamp(record.timestamp || record.dateTime || record.reportDate),
          String(record.quantity || record.amount || ''),
          String(record.totalValue || record.netCash || record.value || ''),
        );
        break;

      case 'koinly':
        if (record.txHash) {
          parts.push(String(record.txHash));
        } else {
          parts.push(
            this.normalizeTimestamp(record.timestamp || record.date),
            String(record.sentAmount || ''),
            String(record.sentCurrency || ''),
            String(record.receivedAmount || ''),
            String(record.receivedCurrency || ''),
          );
        }
        break;

      case 'buxfer':
        if (record.id) {
          parts.push(String(record.id));
        } else {
          parts.push(
            this.normalizeTimestamp(record.timestamp || record.date),
            String(record.amount || ''),
            String(record.description || ''),
          );
        }
        break;

      default:
        // Generic fallback: hash the entire record
        parts.push(this.hashRecord(record));
    }

    // Join and hash for consistent length
    const rawKey = parts.filter(Boolean).join(':');
    return this.hashString(rawKey);
  }

  /**
   * Check if an event with the given idempotency key exists
   */
  async exists(key: string): Promise<boolean> {
    return eventExistsByIdempotencyKey(key);
  }

  /**
   * Check if a batch with the given file hash exists for a user
   */
  async batchExists(userId: string, fileHash: string): Promise<SelectImportBatch | null> {
    return getImportBatchByFileHash(userId, fileHash);
  }

  /**
   * Hash file content for file-level idempotency
   */
  hashFile(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Normalize timestamp to consistent format for key generation
   */
  private normalizeTimestamp(timestamp: unknown): string {
    if (!timestamp) return '';

    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }

    if (typeof timestamp === 'string') {
      // Try to parse and normalize
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      // Return as-is if can't parse
      return timestamp;
    }

    if (typeof timestamp === 'number') {
      return new Date(timestamp).toISOString();
    }

    return String(timestamp);
  }

  /**
   * Hash a string to consistent length
   */
  private hashString(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Hash an entire record (fallback for unknown sources)
   */
  private hashRecord(record: Record<string, unknown>): string {
    // Sort keys for consistent ordering
    const sorted = Object.keys(record)
      .sort()
      .reduce((acc, key) => {
        acc[key] = record[key];
        return acc;
      }, {} as Record<string, unknown>);

    return this.hashString(JSON.stringify(sorted));
  }

  /**
   * Batch check for multiple idempotency keys
   * Returns set of keys that already exist
   */
  async batchCheckExists(keys: string[]): Promise<Set<string>> {
    const existing = new Set<string>();

    // Process in batches to avoid overwhelming the database
    const BATCH_SIZE = 100;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (key) => {
          const exists = await this.exists(key);
          return { key, exists };
        })
      );

      for (const { key, exists } of results) {
        if (exists) {
          existing.add(key);
        }
      }
    }

    return existing;
  }
}

// Singleton instance for shared use
let serviceInstance: IdempotencyService | null = null;

export function getIdempotencyService(): IdempotencyService {
  if (!serviceInstance) {
    serviceInstance = new IdempotencyService();
  }
  return serviceInstance;
}
