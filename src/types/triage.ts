/**
 * Unified Triage Types
 *
 * These types support a unified triage inbox that displays records from:
 * - Position/Strategy triage (triage_records table)
 * - Thesis triage (thesis_triage_records table)
 */

import type { TriageQueueRecord, ThesisTriageQueueRecordFull } from "@/db/queries/triage";

// Object types that can appear in the unified triage queue
export type TriageObjectType = "position" | "strategy" | "asset_thesis" | "macro_thesis";

// Unified status values for display
// Position/Strategy uses: urgent, attention, monitor, info, pending, complete
// Thesis uses: pending, in_review, actioned, dismissed
// We preserve original values and let UI handle display mapping
export type TriageStatus = string;

/**
 * Unified triage record for display in the combined inbox
 */
export interface UnifiedTriageRecord {
  // Core identification
  id: string;
  title: string; // symbol (position/strategy) or displayTitle (thesis - ticker or stripped title)
  objectType: TriageObjectType;
  objectId: string; // positionId, strategyId, or thesisId

  // Common display fields
  trigger: string; // recommendedAction (position/strategy) or triageRule (thesis)
  status: TriageStatus; // severity (position/strategy) or status (thesis)
  date: Date; // snapshotDate (position/strategy) or createdAt (thesis)

  // Direction indicator (bullish/bearish/neutral) for thesis records
  direction?: string | null;

  // For navigation/linking
  strategyId?: string | null;
  strategyKey?: string | null;
  thesisType?: "macro" | "asset";

  // Source record for expanded view (one will be populated)
  positionTriageRecord?: TriageQueueRecord;
  thesisTriageRecord?: ThesisTriageQueueRecordFull;
}

/**
 * Unified filter options for the triage inbox
 */
export interface UnifiedTriageFilters {
  objectType?: TriageObjectType[];
  status?: string[];
  trigger?: string[];
  sort?: "date" | "title" | "trigger" | "status" | "objectType";
  direction?: "asc" | "desc";
  includeAll?: boolean;  // If true, include dismissed/complete records (for "All Triage" view)
}

/**
 * Filter count aggregation for UI dropdowns
 */
export interface UnifiedTriageFilterCounts {
  objectType: Record<TriageObjectType, number>;
  status: Record<string, number>;
  trigger: Record<string, number>;
}

/**
 * Result type for unified triage query
 */
export interface UnifiedTriageResult {
  records: UnifiedTriageRecord[];
  counts: UnifiedTriageFilterCounts;
  totalCount: number;
}

// =============================================================================
// Mapping functions
// =============================================================================

/**
 * Map a position/strategy triage record to unified format
 */
export function mapPositionTriageToUnified(record: TriageQueueRecord): UnifiedTriageRecord {
  const objectType: TriageObjectType =
    record.contextLevel === "strategy" ? "strategy" : "position";

  return {
    id: record.id,
    title: record.symbol,
    objectType,
    objectId: objectType === "strategy" ? (record.strategyId ?? record.id) : (record.positionId ?? record.id),
    trigger: record.recommendedAction ?? "unknown",
    status: record.severity ?? "pending",
    date: new Date(record.snapshotDate),
    direction: record.direction,
    strategyId: record.strategyId,
    strategyKey: record.strategyKey,
    positionTriageRecord: record,
  };
}

/**
 * Map a thesis triage record to unified format
 */
export function mapThesisTriageToUnified(record: ThesisTriageQueueRecordFull): UnifiedTriageRecord {
  const objectType: TriageObjectType =
    record.thesisType === "macro" ? "macro_thesis" : "asset_thesis";

  // For thesis, we use triageRule as the trigger if available,
  // otherwise fall back to triggerType
  const trigger = record.triageRule ?? record.triggerType ?? "unknown";

  return {
    id: record.id,
    // Use displayTitle (ticker for asset, stripped title for macro) instead of full thesisTitle
    title: record.displayTitle,
    objectType,
    objectId: record.thesisId,
    trigger,
    status: record.status,
    date: record.createdAt,
    // Direction for visual indicator (bullish/bearish/neutral)
    direction: record.direction,
    thesisType: record.thesisType as "macro" | "asset",
    thesisTriageRecord: record,
  };
}
