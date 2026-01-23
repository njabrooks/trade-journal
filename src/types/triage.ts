/**
 * Unified Triage Types
 *
 * These types support a unified triage inbox that displays records from:
 * - Position/Strategy triage (triage_records table)
 * - Thesis triage (thesis_triage_records table)
 *
 * Standardized pattern (see docs/CLEANUP_PLAN.md #ENH-047):
 * - Status: workflow state ('inbox' | 'in_progress' | 'done')
 * - Severity: importance level ('urgent' | 'attention' | 'monitor' | 'info')
 */

import type { TriageQueueRecord, ThesisTriageQueueRecordFull } from "@/db/queries/triage";

// Object types that can appear in the unified triage queue
export type TriageObjectType = "position" | "strategy" | "asset_thesis" | "macro_thesis";

// Standardized status values (workflow state)
export type TriageStatusValue = "inbox" | "in_progress" | "done";

// Standardized severity values (importance level)
export type TriageSeverityValue = "urgent" | "attention" | "monitor" | "info";

// For backwards compatibility, allow string
export type TriageStatus = TriageStatusValue | string;
export type TriageSeverity = TriageSeverityValue | string;

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
  status: TriageStatus; // Workflow state: 'inbox' | 'in_progress' | 'done'
  severity: TriageSeverity | null; // Importance: 'urgent' | 'attention' | 'monitor' | 'info'
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

  // Entity-specific filters (for filtered views on detail pages)
  thesisId?: string;      // Filter to specific macro or asset thesis
  strategyId?: string;    // Filter to specific strategy
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

  // For strategy-level records, use strategyLabel if available, otherwise fall back to strategyKey, then symbol
  // For position-level records, use symbol
  const title = objectType === "strategy"
    ? (record.strategyLabel || record.strategyKey || record.symbol)
    : record.symbol;

  return {
    id: record.id,
    title,
    objectType,
    objectId: objectType === "strategy" ? (record.strategyId ?? record.id) : (record.positionId ?? record.id),
    trigger: record.recommendedAction ?? "unknown",
    status: record.status ?? "inbox",
    severity: record.severity,
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
    severity: record.severity,
    date: record.createdAt,
    // Direction for visual indicator (bullish/bearish/neutral)
    direction: record.direction,
    thesisType: record.thesisType as "macro" | "asset",
    thesisTriageRecord: record,
  };
}
