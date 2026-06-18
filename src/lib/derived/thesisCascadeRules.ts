/**
 * Pure thesis-lifecycle cascade rules — no DB, fully unit-testable.
 *
 * Expression-driven monitoring (W8 — docs/v2/07 §3, build step B2): a thesis is
 * `monitoring` iff it has live expression (an active strategy — directly for an
 * asset thesis, or via a linked asset thesis for a macro). These derivations are
 * consumed by the DB orchestration in thesisCascade.ts. Kept DB-free so vitest
 * can exercise them (the test harness blanks DATABASE_URL_POOLER).
 */

export type CascadeStatus = 'developing' | 'monitoring' | 'closed';

/** Statuses the cascade owns. Everything else is judgment-set and skipped. */
export const CASCADE_ELIGIBLE = ['developing', 'monitoring', 'closed'];

export interface AssetThesisStatusInputs {
  /** Current thesis status. */
  current: string;
  /** Strategies on this asset thesis with status === 'active' (live position). */
  activeStrategyCount: number;
}

/**
 * Asset thesis target status from its strategies' state.
 * Returns null when the thesis is not cascade-eligible (leave unchanged).
 *
 *   ≥1 active strategy           → monitoring (live expression)
 *   0 active, was expressed      → closed     (monitoring/closed → flat)
 *   0 active, never expressed    → developing (still building)
 *
 * "was expressed" is read from the current status (monitoring|closed) rather than
 * from historical strategy counts: a thesis only reaches monitoring via this
 * cascade, so a currently-`developing` thesis with no active strategy has never
 * been live and stays developing. This keeps the first run from mass-closing
 * legacy developing theses that were held under the v1 signal-gated model — those
 * are handled by the supervised re-status (B3) and the thesis cull, not here.
 *
 * Note: we require an *active* strategy (not active/draft). A draft strategy has
 * no positions, so it is not "live expression"; promoting on draft would start
 * the monitoring/signal machinery for a position that does not exist. This is the
 * §2 ("live position on") reading of the §3 table.
 */
export function deriveAssetThesisStatus(i: AssetThesisStatusInputs): CascadeStatus | null {
  if (!CASCADE_ELIGIBLE.includes(i.current)) return null;
  if (i.activeStrategyCount >= 1) return 'monitoring';
  if (i.current === 'monitoring' || i.current === 'closed') return 'closed';
  return 'developing';
}

export interface MacroThesisStatusInputs {
  current: string;
  /** True if the macro has ≥1 linked asset thesis (any status). */
  hasLinkedAssets: boolean;
  /** True if any asset thesis linked to this macro resolves to 'monitoring'. */
  anyLinkedAssetMonitoring: boolean;
}

/**
 * Macro thesis target status from its linked asset theses.
 * Returns null (leave unchanged) when not cascade-eligible OR when the macro has
 * no linked asset theses.
 *
 *   no linked assets                  → null (pure top-down belief — judgment-driven)
 *   any linked asset monitoring       → monitoring
 *   none monitoring, was monitoring    → closed
 *   none monitoring, never reached it  → developing
 *
 * A macro with no asset theses is a pure top-down belief with no expression
 * pathway, so expression-driven status does not apply — the cascade leaves it to
 * judgment (docs/v2/07 §3: "A macro with no asset theses can sit in developing
 * indefinitely"). Closing it would falsely assert that an expression ended.
 *
 * A single live linked asset flips the macro to monitoring (docs/v2/07 §3 "any
 * linked asset thesis is monitoring"; open decision #6 resolved to single, not a
 * linked-exposure threshold).
 */
export function deriveMacroThesisStatus(i: MacroThesisStatusInputs): CascadeStatus | null {
  if (!CASCADE_ELIGIBLE.includes(i.current)) return null;
  if (!i.hasLinkedAssets) return null;
  if (i.anyLinkedAssetMonitoring) return 'monitoring';
  if (i.current === 'monitoring' || i.current === 'closed') return 'closed';
  return 'developing';
}
