/**
 * Advisor outcome scoring — Lane C (docs/v2/20), the advisor arm of the
 * execution-quality retrospective (docs/v2/07 §4d).
 *
 * The retrospective's execution axis asks "did we capture the P&L that was
 * available?" per thesis episode. This module asks the same question per acted
 * advisor recommendation: what edge did the structure promise at entry (net
 * premium at the quoted mids) vs what it actually settled at (intrinsic value
 * at expiry spot). Pure math — the DB pass lives in
 * scripts/ops/score-advisor-outcomes.ts; the per-scenario hit-rate summary
 * surfaces on the dashboard advisor module.
 *
 * V1 scores at structure expiry only — fill/close linkage to real positions is
 * explicitly deferred (docs/v2/20 Lane C §3).
 */

export interface AdvisorStructureLeg {
  action: 'buy' | 'sell';
  right: 'put' | 'call';
  strike: number;
  /** YYYY-MM-DD */
  expiry: string;
  /** quoted mid at recommendation time, per share */
  mid: number;
}

export interface AdvisorStructure {
  type: string;
  legs: AdvisorStructureLeg[];
}

/** Frozen into advisor_recommendations.outcome by the scoring pass. */
export interface AdvisorOutcomeScore {
  /** ISO timestamp of the scoring run */
  scoredAt: string;
  /** the structure's settlement date (latest leg expiry, YYYY-MM-DD) */
  expiry: string;
  spotAtExpiry: number;
  /** the as_of_date the settlement spot came from (YYYY-MM-DD) */
  spotDate: string;
  /** net premium at entry per share: credit (+) / debit (−) at the quoted mids */
  entryNetPremiumPerShare: number;
  /** signed intrinsic value of the held structure at expiry spot, per share */
  intrinsicAtExpiryPerShare: number;
  /** entry premium + settlement value — the realized edge per share */
  realizedPnlPerShare: number;
  /**
   * realized > 0. Read per scenario: for credit structures (income/put_entry)
   * this is "kept the premium net of assignment"; for hedges (net debit) it is
   * "the protection paid for itself" — expectedly rare, hedges are insurance.
   */
  win: boolean;
}

const r4 = (v: number): number => Math.round(v * 10000) / 10000;

function intrinsic(leg: AdvisorStructureLeg, spot: number): number {
  return leg.right === 'put' ? Math.max(leg.strike - spot, 0) : Math.max(spot - leg.strike, 0);
}

/** Latest leg expiry — the date the whole structure has settled by. */
export function structureExpiry(structure: AdvisorStructure): string | null {
  const expiries = (structure.legs ?? []).map((l) => l.expiry).filter(Boolean);
  if (expiries.length === 0) return null;
  return expiries.reduce((a, b) => (a > b ? a : b));
}

/** Net premium at entry per share: sells collect, buys pay. */
export function entryNetPremiumPerShare(structure: AdvisorStructure): number {
  return r4(
    (structure.legs ?? []).reduce((sum, l) => sum + (l.action === 'sell' ? l.mid : -l.mid), 0)
  );
}

/** Signed intrinsic value of the held structure at a settlement spot, per share. */
export function intrinsicAtSpotPerShare(structure: AdvisorStructure, spot: number): number {
  return r4(
    (structure.legs ?? []).reduce(
      (sum, l) => sum + (l.action === 'buy' ? intrinsic(l, spot) : -intrinsic(l, spot)),
      0
    )
  );
}

export function scoreAdvisorOutcome(
  structure: AdvisorStructure,
  spotAtExpiry: number,
  spotDate: string,
  scoredAt: string
): AdvisorOutcomeScore | null {
  const expiry = structureExpiry(structure);
  if (!expiry || !Number.isFinite(spotAtExpiry) || spotAtExpiry <= 0) return null;

  const entry = entryNetPremiumPerShare(structure);
  const settle = intrinsicAtSpotPerShare(structure, spotAtExpiry);
  const realized = r4(entry + settle);

  return {
    scoredAt,
    expiry,
    spotAtExpiry,
    spotDate,
    entryNetPremiumPerShare: entry,
    intrinsicAtExpiryPerShare: settle,
    realizedPnlPerShare: realized,
    win: realized > 0,
  };
}

// ---------------------------------------------------------------------------
// Per-scenario hit-rate summary (acted / expired / dismissed — the loop data)
// ---------------------------------------------------------------------------

export interface AdvisorSummaryInputRow {
  scenario: string;
  status: string;
  outcome: unknown;
  expiresAt: Date | string | null;
}

export interface AdvisorScenarioSummary {
  scenario: string;
  acted: number;
  expired: number;
  dismissed: number;
  superseded: number;
  active: number;
  /** acted recs whose outcome has been scored */
  scored: number;
  wins: number;
  /** wins / scored; null until anything is scored */
  hitRate: number | null;
}

function isScoredOutcome(outcome: unknown): outcome is AdvisorOutcomeScore {
  return (
    typeof outcome === 'object' &&
    outcome !== null &&
    typeof (outcome as AdvisorOutcomeScore).realizedPnlPerShare === 'number'
  );
}

/**
 * Tally per scenario. Rows still marked 'active' but past expires_at count as
 * expired — the summary must not depend on the maintenance pass having run.
 */
export function summarizeAdvisorOutcomes(
  rows: AdvisorSummaryInputRow[],
  asOf: Date
): AdvisorScenarioSummary[] {
  const byScenario = new Map<string, AdvisorScenarioSummary>();

  for (const row of rows) {
    let s = byScenario.get(row.scenario);
    if (!s) {
      s = {
        scenario: row.scenario,
        acted: 0,
        expired: 0,
        dismissed: 0,
        superseded: 0,
        active: 0,
        scored: 0,
        wins: 0,
        hitRate: null,
      };
      byScenario.set(row.scenario, s);
    }

    const lapsed =
      row.status === 'active' && row.expiresAt != null && new Date(row.expiresAt) <= asOf;
    const status = lapsed ? 'expired' : row.status;

    if (status === 'acted') {
      s.acted += 1;
      if (isScoredOutcome(row.outcome)) {
        s.scored += 1;
        if (row.outcome.win) s.wins += 1;
      }
    } else if (status === 'expired') s.expired += 1;
    else if (status === 'dismissed') s.dismissed += 1;
    else if (status === 'superseded') s.superseded += 1;
    else if (status === 'active') s.active += 1;
  }

  const summaries = [...byScenario.values()];
  for (const s of summaries) {
    s.hitRate = s.scored > 0 ? Math.round((s.wins / s.scored) * 1000) / 1000 : null;
  }
  return summaries.sort((a, b) => a.scenario.localeCompare(b.scenario));
}
