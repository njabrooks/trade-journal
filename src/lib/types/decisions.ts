/**
 * Decision Item packet — the v2 claim/signal propagation operating model's one
 * decision primitive (docs/v2/09 §7–§8).
 *
 * STORAGE (decided 2026-06-19, docs/v2/09 §8.1): the packet lives in
 * `journal_entries.metadata.decision` on a row with `action_type='decision_required'`.
 * NO dedicated table and NO migration — the `metadata` jsonb column already exists,
 * the DecisionStrip already reads `journal_entries`, and a `decision_items` table can
 * be back-filled from the envelope later if relational joins are ever needed.
 *
 * Lifecycle: active → resolved | dismissed | snoozed (superseded = writer-replaced).
 * Shared by the writer (scripts/ops/raise-decision.ts), the resolver
 * (scripts/ops/resolve-decision.ts), the API (api/dashboard/decisions), and the
 * DecisionStrip component — so this file must stay free of server-only imports.
 */

export const DECISION_PACKET_SCHEMA_VERSION = 1;

/** The full decision_type taxonomy — docs/v2/09 §7 (Matrix 4). */
export type DecisionType =
  | 'confirm_claim_link'
  | 'review_refuting_claim'
  | 'cluster_claims_to_thesis'
  | 'classify_exposure'
  | 'resolve_proxy_underlying'
  | 'develop_thin_thesis'
  | 'frame_asset_under_macro'
  | 'classify_macro_link'
  | 'weakening_signal_action'
  | 'run_deep_dive'
  | 'link_strategy_to_thesis'
  | 're_underwrite_due';

/** Object types a decision can reference (journal_entries.object_type + graph nodes). */
export type DecisionObjectType =
  | 'macro_thesis'
  | 'asset_thesis'
  | 'strategy'
  | 'claim'
  | 'signal'
  | 'underlying'
  | 'position';

/** A graph object referenced by the decision; the primary object is on the journal row. */
export interface RelatedObject {
  type: DecisionObjectType;
  id: string;
  title?: string;
  /** how this object relates, e.g. 'expression' | 'subject' | 'candidate' | 'parent_macro'. */
  role?: string;
}

/** A bounded action that resolves the decision (docs/v2/09 §7 recommended_actions). */
export interface RecommendedAction {
  /** machine key, e.g. 'capture_sources' | 'confirm_link' | 'set_gated_by' | 'dismiss_tactical'. */
  action: string;
  /** human label for the strip button. */
  label: string;
  /** action-specific args (queries, target ids, mapping_type, …) consumed by resolve-decision. */
  payload?: Record<string, unknown>;
}

export type DecisionConfidence = 'low' | 'medium' | 'high';

/** What happened when the decision was resolved (docs/v2/09 §8.3). */
export interface DecisionResolution {
  /** one of the recommended_actions' `action` keys, or 'dismissed'. */
  action_taken: string;
  chosen_by: 'user' | 'agent';
  /** ISO timestamp. */
  at: string;
  notes?: string;
  /** pointer to the graph mutations made, for audit. */
  writes?: Array<{ table: string; op: 'insert' | 'update' | 'delete'; ids: string[] }>;
}

/** The decision packet stored at `journal_entries.metadata.decision`. */
export interface DecisionPacket {
  schema_version: number;
  decision_type: DecisionType;
  related_objects: RelatedObject[];
  why_raised: string;
  evidence_context?: Record<string, unknown>;
  recommended_actions: RecommendedAction[];
  /** skill/mode that resolves it, e.g. '/thesis-review research-gap'. */
  agent_runbook: string;
  default_recommendation?: { action: string; confidence: DecisionConfidence };
  /** ISO date the decision un-snoozes; set only when status='snoozed'. */
  snoozed_until?: string | null;
  resolution?: DecisionResolution | null;
}

/** decision_type → the agent runbook that resolves it (docs/v2/09 §7). */
export const DECISION_RUNBOOKS: Record<DecisionType, string> = {
  confirm_claim_link: '/relate-research',
  review_refuting_claim: '/relate-research',
  cluster_claims_to_thesis: '/thesis-review macro-emergence',
  classify_exposure: 'update-entity-status',
  resolve_proxy_underlying: 'create-underlying + parent_underlying_id',
  develop_thin_thesis: '/thesis-review research-gap',
  frame_asset_under_macro: 'link asset→macro',
  classify_macro_link: 'link asset→macro',
  weakening_signal_action: '/thesis-review health',
  run_deep_dive: 'stage-1…5 → graduate-pipeline-idea',
  link_strategy_to_thesis: 'link-strategies-to-theses',
  re_underwrite_due: '/thesis <X> re-underwrite (new evidence since last version)',
};

/** Short human label for the decision_type chip in the strip. */
export const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  confirm_claim_link: 'Confirm link',
  review_refuting_claim: 'Refuting evidence',
  cluster_claims_to_thesis: 'New thesis?',
  classify_exposure: 'Tactical or belief?',
  resolve_proxy_underlying: 'Resolve underlying',
  develop_thin_thesis: 'Thin thesis',
  frame_asset_under_macro: 'Frame under macro',
  classify_macro_link: 'related / gated_by',
  weakening_signal_action: 'Weakening',
  run_deep_dive: 'Deep dive?',
  link_strategy_to_thesis: 'Link strategy',
  re_underwrite_due: 'Re-underwrite due',
};

/**
 * Build a complete decision packet from the meaningful fields, filling
 * schema_version, the agent_runbook (from DECISION_RUNBOOKS when omitted), and the
 * null lifecycle fields. Shared by every emitter (raise-decision + the in-DB writers)
 * so the envelope shape stays identical everywhere.
 */
export function buildDecisionPacket(input: {
  decision_type: DecisionType;
  why_raised: string;
  related_objects?: RelatedObject[];
  evidence_context?: Record<string, unknown>;
  recommended_actions?: RecommendedAction[];
  agent_runbook?: string;
  default_recommendation?: { action: string; confidence: DecisionConfidence };
}): DecisionPacket {
  return {
    schema_version: DECISION_PACKET_SCHEMA_VERSION,
    decision_type: input.decision_type,
    related_objects: input.related_objects ?? [],
    why_raised: input.why_raised,
    evidence_context: input.evidence_context,
    recommended_actions: input.recommended_actions ?? [],
    agent_runbook: input.agent_runbook ?? DECISION_RUNBOOKS[input.decision_type],
    default_recommendation: input.default_recommendation,
    snoozed_until: null,
    resolution: null,
  };
}

/**
 * Urgency tiers (lower = act first): risk → belief upkeep → graph hygiene → additive.
 * Shared by list-decisions.ts (the /decisions skill ranking) and the /decisions page
 * so both surfaces present the same order. Untyped/legacy packets rank last.
 */
export const DECISION_TYPE_TIERS: Record<DecisionType, number> = {
  review_refuting_claim: 0,
  weakening_signal_action: 0,
  re_underwrite_due: 1,
  develop_thin_thesis: 1,
  frame_asset_under_macro: 2,
  classify_macro_link: 2,
  link_strategy_to_thesis: 2,
  classify_exposure: 2,
  resolve_proxy_underlying: 2,
  confirm_claim_link: 3,
  cluster_claims_to_thesis: 3,
  run_deep_dive: 3,
};

export const UNTYPED_DECISION_TIER = 4;

/**
 * Lane B (docs/v2/20) split: mechanical packets carry a clear proposal the user can
 * one-click resolve/dismiss/snooze in the web UI; everything else is a judgment call
 * that goes through the packet's agent runbook (copy-command deep link).
 * `classify_macro_link` is mechanical only when the writer supplied a clear proposal
 * (a default_recommendation).
 */
export function isMechanicalPacket(packet: DecisionPacket): boolean {
  const t = packet.decision_type;
  if (t === 'confirm_claim_link' || t === 'classify_exposure') return true;
  if (t === 'classify_macro_link') return !!packet.default_recommendation;
  return false;
}

/**
 * The paste-into-terminal command a judgment packet deep-links to (Lane B v1 is
 * clipboard-copy, not a URL scheme). Bespoke for re_underwrite_due (`/thesis <title>`);
 * otherwise the packet's runbook with `<X>` substituted.
 */
export function deepLinkCommand(packet: DecisionPacket, objectTitle: string | null): string {
  if (packet.decision_type === 're_underwrite_due' && objectTitle) {
    return `/thesis ${objectTitle} re-underwrite`;
  }
  const runbook = packet.agent_runbook || DECISION_RUNBOOKS[packet.decision_type];
  return objectTitle ? runbook.replace('<X>', objectTitle) : runbook;
}

export const DECISION_TYPES = Object.keys(DECISION_RUNBOOKS) as DecisionType[];

export function isDecisionType(s: string | undefined | null): s is DecisionType {
  return !!s && (DECISION_TYPES as string[]).includes(s);
}

/** Read the packet off a journal row's metadata, validating shape. Returns null if absent/invalid. */
export function getDecisionPacket(
  metadata: unknown
): DecisionPacket | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const d = (metadata as Record<string, unknown>).decision;
  if (!d || typeof d !== 'object') return null;
  const packet = d as Partial<DecisionPacket>;
  if (!isDecisionType(packet.decision_type)) return null;
  return packet as DecisionPacket;
}
