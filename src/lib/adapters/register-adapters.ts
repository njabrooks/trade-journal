/**
 * Adapter Registration
 *
 * Registers all source adapters with the unified registry.
 * Call registerAllAdapters() at app startup to populate the registry.
 */

import { adapterRegistry, type AdapterEntry } from "./unified-registry";
import type { SyncSourceAdapter } from "./base-adapter";

// ============================================================================
// IBKR Adapters
// ============================================================================

import {
  getIbkrTradeAdapter,
  getIbkrSofAdapter,
  getIbkrMtmpnlAdapter,
  getIbkrPositionsAdapter,
  getIbkrCombinedAdapter,
} from "./ibkr";

// ============================================================================
// Crypto Adapters
// ============================================================================

import { getKoinlyAdapter } from "./koinly-adapter";
import { getCoinbaseAdapter } from "./coinbase-adapter";
import { getBuxferAdapter } from "./buxfer-adapter";

// ============================================================================
// Adapter Entries
// ============================================================================

/**
 * IBKR Trade Adapter Entry
 * Handles trade confirmations from Interactive Brokers
 */
const ibkrTradeEntry: AdapterEntry = {
  name: "ibkr_trade",
  description: "Interactive Brokers Trade Confirmations",
  factory: () => getIbkrTradeAdapter() as unknown as SyncSourceAdapter,
  category: "ibkr",
  type: "event",
  filePatterns: [
    /ibkr.*trade/i,
    /trade.*confirm/i,
    /flexquery.*trade/i,
  ],
  headerPatterns: [
    "clientaccountid",
    "conid",
    "tradeprice",
    "ibcommission",
  ],
};

/**
 * IBKR SOF (Statement of Funds) Adapter Entry
 * Handles dividends, interest, fees, deposits, withdrawals
 */
const ibkrSofEntry: AdapterEntry = {
  name: "ibkr_sof",
  description: "Interactive Brokers Statement of Funds",
  factory: () => getIbkrSofAdapter() as unknown as SyncSourceAdapter,
  category: "ibkr",
  type: "event",
  filePatterns: [
    /ibkr.*sof/i,
    /statement.*funds/i,
    /flexquery.*sof/i,
  ],
  headerPatterns: [
    "clientaccountid",
    "activitycode",
    "activitydescription",
    "balance",
  ],
};

/**
 * IBKR MTM P&L Adapter Entry (Specialized)
 * Extracts price history from mark-to-market P&L reports
 */
const ibkrMtmpnlEntry: AdapterEntry = {
  name: "ibkr_mtmpnl",
  description: "Interactive Brokers MTM P&L (Price History)",
  factory: () => getIbkrMtmpnlAdapter() as unknown as unknown as SyncSourceAdapter,
  category: "ibkr",
  type: "specialized",
  filePatterns: [
    /ibkr.*mtm/i,
    /mark.*market/i,
    /mtmpnl/i,
  ],
  headerPatterns: [
    "clientaccountid",
    "conid",
    "priorcloseprice",
    "currentcloseprice",
  ],
};

/**
 * IBKR Positions Adapter Entry (Specialized)
 * Creates daily snapshots from open positions reports
 */
const ibkrPositionsEntry: AdapterEntry = {
  name: "ibkr_positions",
  description: "Interactive Brokers Open Positions (Daily Snapshots)",
  factory: () => getIbkrPositionsAdapter() as unknown as unknown as SyncSourceAdapter,
  category: "ibkr",
  type: "specialized",
  filePatterns: [
    /ibkr.*position/i,
    /open.*position/i,
    /flexquery.*position/i,
  ],
  headerPatterns: [
    "clientaccountid",
    "conid",
    "position",
    "markprice",
    "positionvalue",
  ],
};

/**
 * IBKR Combined File Adapter Entry
 * Handles combined report files containing STFU, POST, FXPO, TRNT, RATE sections
 * Note: This adapter has a custom processing flow and doesn't use the standard BaseAdapter interface
 */
const ibkrCombinedEntry: AdapterEntry = {
  name: "ibkr_combined",
  description: "Interactive Brokers Combined Report (Multi-Section)",
  factory: () => getIbkrCombinedAdapter() as unknown as SyncSourceAdapter,
  category: "ibkr",
  type: "event",
  filePatterns: [
    /^\d{8}.*ibkr/i, // Files like "20240405 IBKR Nick.csv"
    /ibkr.*combined/i,
  ],
  headerPatterns: [
    // Combined files start with BOF marker
    "bof,",
  ],
};

/**
 * Koinly Adapter Entry
 * Handles crypto transaction exports from Koinly tax software
 */
const koinlyEntry: AdapterEntry = {
  name: "koinly",
  description: "Koinly Crypto Transaction Export",
  factory: () => getKoinlyAdapter() as unknown as SyncSourceAdapter,
  category: "crypto",
  type: "event",
  filePatterns: [
    /koinly/i,
    /koinly.*export/i,
  ],
  headerPatterns: [
    "date",
    "type",
    "tag",
    "sending wallet",
    "sent amount",
    "received amount",
  ],
};

/**
 * Coinbase Adapter Entry
 * Handles transaction exports from Coinbase exchange
 */
const coinbaseEntry: AdapterEntry = {
  name: "coinbase",
  description: "Coinbase Transaction Export",
  factory: () => getCoinbaseAdapter() as unknown as SyncSourceAdapter,
  category: "crypto",
  type: "event",
  filePatterns: [
    /coinbase/i,
    /coinbase.*transaction/i,
  ],
  headerPatterns: [
    "timestamp",
    "transaction type",
    "asset",
    "quantity transacted",
    "spot price currency",
  ],
};

/**
 * Buxfer Adapter Entry
 * Handles personal finance exports from Buxfer
 */
const buxferEntry: AdapterEntry = {
  name: "buxfer",
  description: "Buxfer Personal Finance Export",
  factory: () => getBuxferAdapter() as unknown as SyncSourceAdapter,
  category: "other",
  type: "event",
  filePatterns: [
    /buxfer/i,
    /buxfer.*export/i,
  ],
  headerPatterns: [
    "id",
    "date",
    "description",
    "amount",
    "tags",
    "account",
  ],
};

// ============================================================================
// All Adapter Entries
// ============================================================================

/**
 * All adapter entries for registration
 */
const allAdapterEntries: AdapterEntry[] = [
  // IBKR Adapters
  ibkrTradeEntry,
  ibkrSofEntry,
  ibkrMtmpnlEntry,
  ibkrPositionsEntry,
  ibkrCombinedEntry,
  // Crypto Adapters
  koinlyEntry,
  coinbaseEntry,
  // Other Adapters
  buxferEntry,
];

// ============================================================================
// Registration Function
// ============================================================================

/**
 * Register all adapters with the unified registry.
 * Call this at app startup.
 *
 * @example
 * ```typescript
 * import { registerAllAdapters } from './register-adapters';
 *
 * // At app startup
 * registerAllAdapters();
 *
 * // Now use the registry
 * const adapter = adapterRegistry.getAdapter('koinly');
 * ```
 */
export function registerAllAdapters(): void {
  // Skip if already initialized
  if (adapterRegistry.isInitialized()) {
    return;
  }

  // Register all adapters
  for (const entry of allAdapterEntries) {
    adapterRegistry.register(entry);
  }

  // Mark as initialized
  adapterRegistry.markInitialized();
}

/**
 * Get count of registered adapters by category
 */
export function getAdapterCounts(): Record<string, number> {
  return {
    ibkr: adapterRegistry.getByCategory("ibkr").length,
    crypto: adapterRegistry.getByCategory("crypto").length,
    other: adapterRegistry.getByCategory("other").length,
    total: adapterRegistry.size,
    event: adapterRegistry.getEventAdapters().length,
    specialized: adapterRegistry.getSpecializedAdapters().length,
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Individual entries (for testing/extension)
  ibkrTradeEntry,
  ibkrSofEntry,
  ibkrMtmpnlEntry,
  ibkrPositionsEntry,
  ibkrCombinedEntry,
  koinlyEntry,
  coinbaseEntry,
  buxferEntry,
  // All entries
  allAdapterEntries,
};
