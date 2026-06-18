/**
 * Pure rule for signal-derivation triggering (W8 — docs/v2/07 §4b, B5). No DB.
 *
 * Expression-driven monitoring means a thesis can reach `monitoring` (live
 * position, via the cascade) before it has any signals. Signals are the
 * invalidation/confirmation/completion digest the agent operates against incoming
 * evidence — so a monitoring thesis with no active signals has nowhere to land
 * that evidence. This rule decides, per monitoring thesis, whether to derive
 * signals now, flag it as a research gap, or skip.
 */

export interface SignalDerivationInputs {
  status: string;
  /** Active signals currently linked to the thesis (via signal_entity_links). */
  activeSignalCount: number;
  /** Claims mapped to the thesis (any mapping_type) — the material signals derive from. */
  claimCount: number;
}

export type SignalDerivationAction = 'derive' | 'thin' | 'skip';

/**
 * What to do for a thesis on the signal-derivation pass:
 *
 *   not monitoring                          → skip (only live theses get signals)
 *   monitoring, already has active signals  → skip (don't clobber; refresh is the health pass, 4c)
 *   monitoring, no signals, has claims       → derive (synthesize digest + qualitative signals)
 *   monitoring, no signals, no claims        → thin (can't ground signals — research-gap bridge, B6/§4e)
 *
 * We never fabricate signals for a thin thesis (§4b/§4e) — that's surfaced as a
 * research gap instead.
 */
export function signalDerivationAction(i: SignalDerivationInputs): SignalDerivationAction {
  if (i.status !== 'monitoring') return 'skip';
  if (i.activeSignalCount > 0) return 'skip';
  if (i.claimCount <= 0) return 'thin';
  return 'derive';
}
