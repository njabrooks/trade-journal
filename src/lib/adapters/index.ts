/**
 * Adapters barrel export
 *
 * Re-exports the adapter framework, registry, and all individual adapters.
 */

// Base adapter framework
export {
  BaseAdapter,
  type AdapterTransformContext,
  type SyncSourceAdapter,
  type ParseResult,
  type ParseError,
  type NormalizedRecord,
  type CanonicalEvent,
} from "./base-adapter";

// Base specialized adapter (for non-event adapters)
export {
  BaseSpecializedAdapter,
  type SpecializedAdapter,
  type SpecializedTransformContext,
} from "./base-specialized-adapter";

// Adapter types and helpers
export {
  type SourceAdapter,
  type AdapterProcessResult,
  type AdapterBatchResult,
  isCanonicalEvent,
  generateTempId,
  hashForKey,
  ACQUISITION_EVENT_TYPES,
  DISPOSAL_EVENT_TYPES,
  isAcquisitionType,
  isDisposalType,
} from "./types";

// Registry
export {
  adapterRegistry,
  type AdapterCategory,
  type AdapterType,
  type AdapterEntry,
  type DetectionResult,
  type AdapterInfo,
} from "./unified-registry";

export { registerAllAdapters, getAdapterCounts } from "./register-adapters";

// IBKR adapters
export {
  IbkrTradeAdapter,
  getIbkrTradeAdapter,
  resetIbkrTradeAdapter,
  IbkrSofAdapter,
  getIbkrSofAdapter,
  resetIbkrSofAdapter,
  IbkrCombinedAdapter,
  getIbkrCombinedAdapter,
  resetIbkrCombinedAdapter,
  processIbkrCombinedFile,
  isIbkrCombinedFile,
  getIbkrCombinedFileSummary,
  IbkrMtmpnlAdapter,
  getIbkrMtmpnlAdapter,
  resetIbkrMtmpnlAdapter,
  IbkrPositionsAdapter,
  getIbkrPositionsAdapter,
  resetIbkrPositionsAdapter,
  parseIbkrCombinedFile,
} from "./ibkr";

// Koinly adapter
export {
  KoinlyAdapter,
  getKoinlyAdapter,
  resetKoinlyAdapter,
} from "./koinly-adapter";

// Coinbase adapter
export {
  CoinbaseAdapter,
  getCoinbaseAdapter,
  resetCoinbaseAdapter,
} from "./coinbase-adapter";

// Buxfer adapter
export {
  BuxferAdapter,
  getBuxferAdapter,
  resetBuxferAdapter,
} from "./buxfer-adapter";
