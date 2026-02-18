/**
 * IBKR Combined File Adapter
 *
 * Handles IBKR's combined report format which contains multiple report types
 * (STFU, POST, FXPO, TRNT, RATE) in a single CSV file.
 *
 * This adapter:
 * 1. Parses the combined file using ibkr-combined-parser
 * 2. Extracts TRNT (trades) and STFU (statement of funds) sections
 * 3. Delegates to IbkrTradeAdapter and IbkrSofAdapter for processing
 * 4. Returns all canonical events from both adapters
 *
 * Ported from twotreescap-app/services/event-sourcing/adapters/ibkr/ibkr-combined-adapter.ts
 */

import type { CanonicalEvent } from "@/types/event-sourcing";
import {
  parseIbkrCombinedFile,
  prepareTradesForAdapter,
  prepareStatementOfFundsForAdapter,
  getFileSummary,
  type IbkrCombinedFile,
  type IbkrFileSummary,
} from "./ibkr-combined-parser";
import { getIbkrTradeAdapter } from "./ibkr-trade-adapter";
import { getIbkrSofAdapter } from "./ibkr-sof-adapter";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for processing a combined IBKR file
 */
export interface IbkrCombinedOptions {
  /** User ID for the events */
  userId: string;

  /** Import batch ID for tracking */
  importBatchId?: string;

  /** Whether to process TRNT (trades) section */
  processTrades?: boolean;

  /** Whether to process STFU (statement of funds) section */
  processStatementOfFunds?: boolean;

  /** Owner override (if not using account-based mapping) */
  owner?: string;

  /** Account name override */
  account?: string;
}

/**
 * Result of processing a combined IBKR file
 */
export interface IbkrCombinedResult {
  /** Summary of the parsed file */
  summary: IbkrFileSummary;

  /** Events from TRNT (trades) section */
  tradeEvents: CanonicalEvent[];

  /** Events from STFU (statement of funds) section */
  sofEvents: CanonicalEvent[];

  /** All events combined */
  allEvents: CanonicalEvent[];

  /** Processing stats */
  stats: {
    tradeRowsProcessed: number;
    sofRowsProcessed: number;
    totalEventsGenerated: number;
    errors: string[];
  };
}

// ============================================================================
// IBKR Combined Adapter
// ============================================================================

/**
 * Process an IBKR combined file and return canonical events
 *
 * @param content - Raw CSV content of the combined file
 * @param options - Processing options
 * @returns IbkrCombinedResult with all generated events
 *
 * @example
 * ```typescript
 * const result = await processIbkrCombinedFile(csvContent, {
 *   userId: 'user_123',
 *   importBatchId: 'batch_456',
 *   processTrades: true,
 *   processStatementOfFunds: true,
 * });
 *
 * console.log(`Generated ${result.allEvents.length} events`);
 * ```
 */
export function processIbkrCombinedFile(
  content: string,
  options: IbkrCombinedOptions
): IbkrCombinedResult {
  const {
    userId,
    importBatchId,
    processTrades = true,
    processStatementOfFunds = true,
  } = options;

  // Parse the combined file
  const parsedFile = parseIbkrCombinedFile(content);
  const summary = getFileSummary(parsedFile);

  const tradeEvents: CanonicalEvent[] = [];
  const sofEvents: CanonicalEvent[] = [];
  const errors: string[] = [];

  // Build transform context
  // Note: owner/account are derived from the raw data by the adapters
  const transformContext = {
    userId,
    owner: "", // Will be overridden by adapter from raw data
    account: "", // Will be overridden by adapter from raw data
    batchId: importBatchId || "",
  };

  // Process TRNT (trades) if enabled and data exists
  if (processTrades && summary.sectionCounts.TRNT.rows > 0) {
    try {
      const tradesCsv = prepareTradesForAdapter(parsedFile);
      const tradeAdapter = getIbkrTradeAdapter();

      // Parse CSV content
      const parseResult = tradeAdapter.parse(tradesCsv);

      if (!parseResult.success) {
        errors.push(...parseResult.errors.map((e) => `Trade parse error: ${e.message}`));
      }

      // Process each record through the adapter pipeline
      for (const raw of parseResult.records) {
        try {
          const normalized = tradeAdapter.normalize(raw);
          const events = tradeAdapter.expand(normalized, transformContext);
          tradeEvents.push(...events);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Trade processing error: ${errorMsg}`);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`TRNT section error: ${errorMsg}`);
    }
  }

  // Process STFU (statement of funds) if enabled and data exists
  if (processStatementOfFunds && summary.sectionCounts.STFU.rows > 0) {
    try {
      const sofCsv = prepareStatementOfFundsForAdapter(parsedFile);
      const sofAdapter = getIbkrSofAdapter();

      // Parse CSV content
      const parseResult = sofAdapter.parse(sofCsv);

      if (!parseResult.success) {
        errors.push(...parseResult.errors.map((e) => `SOF parse error: ${e.message}`));
      }

      // Process each record through the adapter pipeline
      for (const raw of parseResult.records) {
        try {
          const normalized = sofAdapter.normalize(raw);
          const events = sofAdapter.expand(normalized, transformContext);
          sofEvents.push(...events);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`SOF processing error: ${errorMsg}`);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`STFU section error: ${errorMsg}`);
    }
  }

  // Combine all events
  const allEvents = [...tradeEvents, ...sofEvents];

  return {
    summary,
    tradeEvents,
    sofEvents,
    allEvents,
    stats: {
      tradeRowsProcessed: summary.sectionCounts.TRNT.rows,
      sofRowsProcessed: summary.sectionCounts.STFU.rows,
      totalEventsGenerated: allEvents.length,
      errors,
    },
  };
}

/**
 * Quick check if a CSV content is an IBKR combined file
 *
 * @param content - CSV content to check
 * @returns true if the content appears to be an IBKR combined file
 */
export function isIbkrCombinedFile(content: string): boolean {
  // Check first few lines for BOF marker (some files have Excel header before BOF)
  const firstLines = content.split("\n").slice(0, 5);
  for (const line of firstLines) {
    // Handle both quoted ("BOF") and unquoted (BOF) formats
    if (line.startsWith("BOF,") || line.startsWith('"BOF"')) {
      return true;
    }
  }
  return false;
}

/**
 * Get summary of an IBKR combined file without full processing
 *
 * @param content - CSV content to analyze
 * @returns Summary statistics
 */
export function getIbkrCombinedFileSummary(content: string): IbkrFileSummary {
  const parsedFile = parseIbkrCombinedFile(content);
  return getFileSummary(parsedFile);
}

// ============================================================================
// Singleton Pattern (for consistency with other adapters)
// ============================================================================

/**
 * IbkrCombinedAdapter class wrapper for registry integration
 */
export class IbkrCombinedAdapter {
  readonly name = "ibkr_combined" as const;
  readonly version = "1.0.0";
  readonly description = "IBKR Combined Report Format (STFU, TRNT, POST, FXPO, RATE)";

  /**
   * Process a combined file and return events
   */
  process(content: string, options: IbkrCombinedOptions): IbkrCombinedResult {
    return processIbkrCombinedFile(content, options);
  }

  /**
   * Check if content is a combined file
   */
  canHandle(content: string): boolean {
    return isIbkrCombinedFile(content);
  }

  /**
   * Get file summary without processing
   */
  getSummary(content: string): IbkrFileSummary {
    return getIbkrCombinedFileSummary(content);
  }
}

// Singleton instance
let adapterInstance: IbkrCombinedAdapter | null = null;

/**
 * Get the singleton IbkrCombinedAdapter instance
 */
export function getIbkrCombinedAdapter(): IbkrCombinedAdapter {
  if (!adapterInstance) {
    adapterInstance = new IbkrCombinedAdapter();
  }
  return adapterInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetIbkrCombinedAdapter(): void {
  adapterInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  processIbkrCombinedFile,
  isIbkrCombinedFile,
  getIbkrCombinedFileSummary,
  getIbkrCombinedAdapter,
  IbkrCombinedAdapter,
};
