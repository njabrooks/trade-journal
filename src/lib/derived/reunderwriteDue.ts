/**
 * Re-underwrite-due detector (W8.x — docs/v2/10).
 *
 * Closes the "when to re-underwrite" gap: a thesis that already has an underwriting
 * but has since accumulated material new evidence isn't refreshed automatically (the
 * digest-refresh worklist is developing-only and never regenerates signals). This
 * detector flags ALREADY-UNDERWRITTEN asset OR macro theses where, since their latest
 * articulation version, either:
 *   - linked claims grew by >= threshold (default 8), or
 *   - >= REFUTE_THRESHOLD (default 2) new REFUTING claims landed.
 *
 * Thresholds tuned up 2026-07-07 (was delta 5 / refutes 1): one or two new claims rarely
 * change a thesis, and a SINGLE refuting claim is already surfaced at link time as a lighter
 * `review_refuting_claim` decision by relate-research — so a full re-underwrite here now needs
 * genuine accumulation (>=8) or a PATTERN of counter-evidence (>=2 refutes), not a single link.
 *
 * Claim-delta based ⇒ ticker-agnostic ⇒ works for macro theses natively (unlike the
 * ticker-based completeness backstop in thesis-snapshot). The maintenance / thesis
 * skills consume this worklist and raise a typed `re_underwrite_due` DecisionStrip item.
 *
 * Never-underwritten theses are intentionally excluded — they belong to the signal-
 * derivation / digest worklists, not "re-underwrite".
 */
import { db } from '@/db';
import { macroTheses, assetTheses, thesisArticulations, claimThesisMappings } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

export const DEFAULT_REUNDERWRITE_THRESHOLD = 8;
/** New refuting claims needed to escalate to a full re-underwrite (a single refute is already
 *  surfaced as a lighter review_refuting_claim decision at link time). */
export const REUNDERWRITE_REFUTE_THRESHOLD = 2;
const ACTIVE = ['developing', 'monitoring'];

export interface ReunderwriteDueItem {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  title: string;
  status: string;
  lastVersion: number;
  lastArticulationAt: string;
  currentClaims: number;
  claimsAtLastArticulation: number;
  claimsDelta: number;
  newRefutes: number;
  reason: string;
}

export async function findThesesDueForReunderwrite(
  threshold = DEFAULT_REUNDERWRITE_THRESHOLD,
): Promise<ReunderwriteDueItem[]> {
  const out: ReunderwriteDueItem[] = [];

  for (const thesisType of ['macro', 'asset'] as const) {
    const table = thesisType === 'macro' ? macroTheses : assetTheses;
    const fkCol = thesisType === 'macro' ? claimThesisMappings.macroThesisId : claimThesisMappings.assetThesisId;

    // Active theses + their claim-count-at-last-articulation watermark.
    const theses = await db
      .select({ id: table.id, title: table.title, status: table.status, claimsAtLast: table.claimsCountAtLastArticulation })
      .from(table)
      .where(inArray(table.status, ACTIVE));
    if (theses.length === 0) continue;

    // Latest articulation per thesis (reduce in JS — small table).
    const arts = await db
      .select({ thesisId: thesisArticulations.thesisId, version: thesisArticulations.version, createdAt: thesisArticulations.createdAt })
      .from(thesisArticulations)
      .where(eq(thesisArticulations.thesisType, thesisType));
    const latestArt = new Map<string, { version: number; createdAt: Date }>();
    for (const a of arts) {
      const cur = latestArt.get(a.thesisId);
      if (!cur || a.version > cur.version) latestArt.set(a.thesisId, { version: a.version, createdAt: a.createdAt as Date });
    }

    // All mappings for this type (claim counts + refute timing) — reduce in JS.
    const maps = await db
      .select({ thesisId: fkCol, mappingType: claimThesisMappings.mappingType, mappedAt: claimThesisMappings.mappedAt })
      .from(claimThesisMappings);
    const counts = new Map<string, number>();
    const refuteDates = new Map<string, Date[]>();
    for (const m of maps) {
      if (!m.thesisId) continue;
      counts.set(m.thesisId, (counts.get(m.thesisId) ?? 0) + 1);
      if (m.mappingType === 'refutes') {
        const arr = refuteDates.get(m.thesisId) ?? [];
        arr.push(m.mappedAt as Date);
        refuteDates.set(m.thesisId, arr);
      }
    }

    for (const t of theses) {
      const art = latestArt.get(t.id);
      if (!art) continue; // never underwritten — not a re-underwrite candidate
      const currentClaims = counts.get(t.id) ?? 0;
      const claimsAtLast = t.claimsAtLast ?? 0;
      const claimsDelta = currentClaims - claimsAtLast;
      const newRefutes = (refuteDates.get(t.id) ?? []).filter((d) => d > art.createdAt).length;
      if (claimsDelta >= threshold || newRefutes >= REUNDERWRITE_REFUTE_THRESHOLD) {
        const reasons: string[] = [];
        if (claimsDelta >= threshold) reasons.push(`+${claimsDelta} claims since v${art.version}`);
        if (newRefutes >= REUNDERWRITE_REFUTE_THRESHOLD) reasons.push(`${newRefutes} new refuting claims`);
        out.push({
          thesisId: t.id,
          thesisType,
          title: t.title,
          status: t.status,
          lastVersion: art.version,
          lastArticulationAt: (art.createdAt as Date).toISOString(),
          currentClaims,
          claimsAtLastArticulation: claimsAtLast,
          claimsDelta,
          newRefutes,
          reason: reasons.join('; '),
        });
      }
    }
  }

  // Refuting evidence first, then largest accumulation.
  out.sort((a, b) => b.newRefutes - a.newRefutes || b.claimsDelta - a.claimsDelta);
  return out;
}
