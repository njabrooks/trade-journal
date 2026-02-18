/**
 * IBKR Adapters Index
 *
 * Exports all IBKR source adapters for use in the event sourcing pipeline.
 *
 * Event Adapters (produce CanonicalEvent[]):
 * - IbkrTradeAdapter: Trade confirmations
 * - IbkrSofAdapter: Statement of funds (dividends, interest, fees, etc.)
 *
 * Specialized Adapters (produce other data types):
 * - IbkrMtmpnlAdapter: Mark-to-market P&L -> price history
 * - IbkrPositionsAdapter: Open positions -> daily snapshots
 *
 * Ported from twotreescap-app/services/event-sourcing/adapters/ibkr/index.ts
 */

// ============================================================================
// Event Adapters
// ============================================================================

export {
  IbkrTradeAdapter,
  getIbkrTradeAdapter,
  resetIbkrTradeAdapter,
  type IbkrTradeRaw,
} from "./ibkr-trade-adapter";

export {
  IbkrSofAdapter,
  getIbkrSofAdapter,
  resetIbkrSofAdapter,
  type IbkrSofRaw,
} from "./ibkr-sof-adapter";

// ============================================================================
// Combined File Adapter
// ============================================================================

export {
  IbkrCombinedAdapter,
  getIbkrCombinedAdapter,
  resetIbkrCombinedAdapter,
  processIbkrCombinedFile,
  isIbkrCombinedFile,
  getIbkrCombinedFileSummary,
  type IbkrCombinedOptions,
  type IbkrCombinedResult,
} from "./ibkr-combined-adapter";

// ============================================================================
// Combined File Parser
// ============================================================================

export {
  parseIbkrCombinedFile,
  extractTradesCsv,
  extractStatementOfFundsCsv,
  extractPositionsCsv,
  extractFxBalancesCsv,
  extractConversionRatesCsv,
  extractSectionCsv,
  extractSectionsForDateRange,
  getFileSummary,
  printFileSummary,
  prepareTradesForAdapter,
  prepareStatementOfFundsForAdapter,
  getUniqueDates,
  getUniqueSymbolsFromTrades,
  getUniqueSymbolsFromPositions,
  type IbkrSectionCode,
  type IbkrFileMetadata,
  type IbkrDayMetadata,
  type IbkrSection,
  type IbkrDayData,
  type IbkrCombinedFile,
  type IbkrFileSummary,
  type CsvConversionOptions,
} from "./ibkr-combined-parser";

// ============================================================================
// Specialized Adapters
// ============================================================================

export {
  IbkrMtmpnlAdapter,
  getIbkrMtmpnlAdapter,
  resetIbkrMtmpnlAdapter,
  type IbkrMtmpnlRaw,
  type MtmpnlPriceOutput,
} from "./ibkr-mtmpnl-adapter";

export {
  IbkrPositionsAdapter,
  getIbkrPositionsAdapter,
  resetIbkrPositionsAdapter,
  type IbkrPositionsRaw,
  type PositionsSnapshotOutput,
} from "./ibkr-positions-adapter";

// ============================================================================
// Utilities
// ============================================================================

export {
  mapOwnerFromAccountId,
  getAccountName,
  mapIbkrAssetClass,
  mapIbkrAssetClassLegacy,
  parseIbkrDateTime,
  parseIbkrDate,
  toDate,
  parseNumeric,
  toNumber,
  convertToBase,
  hash,
  generateIbkrTradeIdempotencyKey,
  generateIbkrSofIdempotencyKey,
  generateId,
  normalizeIbkrSymbol,
} from "./utils";
