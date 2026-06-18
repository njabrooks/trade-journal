/**
 * Monitoring thesis-health pass — DB layer (W8 — docs/v2/07 §4c, B5c).
 *
 *   1. findMonitoringThesesDueForHealthCheck — signal-bearing monitoring theses that
 *      are due (new routed evidence since last review, or the weekly floor elapsed).
 *   2. gatherHealthContext — per thesis: its active signals, the recent routed
 *      evidence on each (signal_data_snapshots, newest first), the last health
 *      verdict per signal (for change detection), and light price context.
 *
 * The verdict rendering is the thesis-review skill (health mode). It writes results
 * via scripts/record-thesis-health.ts: a `thesis_health` snapshot per signal ONLY on
 * a material change, a DecisionStrip item ONLY on weakening/invalidation, and it
 * always stamps thesis.last_reviewed_at so the cadence advances (change-only — a
 * quiet thesis records no snapshot but is still marked reviewed).
 */
import { db } from '@/db';
import {
  macroTheses,
  assetTheses,
  underlyings,
  signals as signalsTable,
  signalEntityLinks,
  signalDataSnapshots,
} from '@/db/schema';
import { eq, and, inArray, sql, desc, ne, isNotNull } from 'drizzle-orm';
import { thesisHealthDue, THESIS_HEALTH_FLOOR_DAYS } from '@/lib/derived/thesisHealthRules';

export { thesisHealthDue, isWeakening, THESIS_HEALTH_FLOOR_DAYS } from '@/lib/derived/thesisHealthRules';

const HEALTH_SOURCE = 'thesis_health';

export interface HealthWorklistItem {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  title: string;
  activeSignalCount: number;
  lastReviewedAt: Date | null;
  hasNewEvidenceSince: boolean;
}

/** Active-signal thesis links keyed by `${type}:${id}` → signalIds. */
async function activeSignalsByThesis(): Promise<Map<string, string[]>> {
  const rows = await db
    .select({
      signalId: signalEntityLinks.signalId,
      thesisId: signalEntityLinks.thesisId,
      thesisType: signalEntityLinks.thesisType,
    })
    .from(signalEntityLinks)
    .innerJoin(signalsTable, eq(signalsTable.id, signalEntityLinks.signalId))
    .where(and(eq(signalsTable.status, 'active'), isNotNull(signalEntityLinks.thesisId)));
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.thesisId || !r.thesisType) continue;
    const key = `${r.thesisType}:${r.thesisId}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r.signalId);
  }
  return map;
}

/** Latest non-health evidence timestamp per signalId (the routed evidence the pass reacts to). */
async function latestEvidenceBySignal(signalIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (signalIds.length === 0) return out;
  const rows = await db
    .select({
      signalId: signalDataSnapshots.signalId,
      last: sql<string | null>`max(${signalDataSnapshots.createdAt})`,
    })
    .from(signalDataSnapshots)
    .where(and(inArray(signalDataSnapshots.signalId, signalIds), ne(signalDataSnapshots.dataSource, HEALTH_SOURCE)))
    .groupBy(signalDataSnapshots.signalId);
  for (const r of rows) if (r.signalId && r.last) out.set(r.signalId, new Date(r.last));
  return out;
}

export async function findMonitoringThesesDueForHealthCheck(
  floorDays = THESIS_HEALTH_FLOOR_DAYS,
): Promise<HealthWorklistItem[]> {
  const macroRows = await db
    .select({ thesisId: macroTheses.id, title: macroTheses.title, lastReviewedAt: macroTheses.lastReviewedAt })
    .from(macroTheses)
    .where(eq(macroTheses.status, 'monitoring'));
  const assetRows = await db
    .select({ thesisId: assetTheses.id, title: assetTheses.title, lastReviewedAt: assetTheses.lastReviewedAt })
    .from(assetTheses)
    .where(eq(assetTheses.status, 'monitoring'));

  const signalsByThesis = await activeSignalsByThesis();
  const allSignalIds = [...signalsByThesis.values()].flat();
  const evidenceBySignal = await latestEvidenceBySignal(allSignalIds);
  const asOf = new Date();

  const items: HealthWorklistItem[] = [];
  for (const r of [
    ...macroRows.map((m) => ({ ...m, thesisType: 'macro' as const })),
    ...assetRows.map((a) => ({ ...a, thesisType: 'asset' as const })),
  ]) {
    const key = `${r.thesisType}:${r.thesisId}`;
    const signalIds = signalsByThesis.get(key) ?? [];
    if (signalIds.length === 0) continue; // only signal-bearing theses are assessable

    // newest routed evidence across this thesis's signals
    let latestEvidence: Date | null = null;
    for (const sid of signalIds) {
      const e = evidenceBySignal.get(sid);
      if (e && (!latestEvidence || e > latestEvidence)) latestEvidence = e;
    }
    const lastReviewedAt = r.lastReviewedAt ? new Date(r.lastReviewedAt) : null;
    const hasNewEvidenceSince =
      latestEvidence != null && (lastReviewedAt == null || latestEvidence > lastReviewedAt);

    if (thesisHealthDue({ hasActiveSignals: true, lastHealthCheck: lastReviewedAt, hasNewEvidenceSince, asOf, floorDays })) {
      items.push({
        thesisId: r.thesisId,
        thesisType: r.thesisType,
        title: r.title,
        activeSignalCount: signalIds.length,
        lastReviewedAt,
        hasNewEvidenceSince,
      });
    }
  }
  // Theses with fresh evidence first, then stalest review.
  items.sort((a, b) => Number(b.hasNewEvidenceSince) - Number(a.hasNewEvidenceSince));
  return items;
}

export interface HealthSignalEvidence {
  assessment: string | null;
  evidenceSummary: string | null;
  dataSource: string;
  snapshotDate: Date | null;
  createdAt: string | null;
}

export interface HealthSignal {
  id: string;
  type: string;
  statement: string;
  notes: string | null;
  linkedClaimIds: string[] | null;
  /** Most recent prior health verdict for this signal (for material-change detection). */
  lastHealthAssessment: string | null;
  /** Recent routed evidence on this signal, newest first. */
  recentEvidence: HealthSignalEvidence[];
}

export interface HealthContext {
  thesis: { id: string; thesisType: 'macro' | 'asset'; title: string; direction: string | null; status: string; ticker?: string | null; spot?: string | null };
  signals: HealthSignal[];
}

/** Assemble the health-pass inputs for one thesis: its signals + recent evidence + last verdict + price context. */
export async function gatherHealthContext(
  thesisId: string,
  thesisType: 'macro' | 'asset',
  evidencePerSignal = 6,
): Promise<HealthContext | null> {
  let thesis: HealthContext['thesis'] | null = null;
  if (thesisType === 'macro') {
    const [m] = await db
      .select({ id: macroTheses.id, title: macroTheses.title, direction: macroTheses.direction, status: macroTheses.status })
      .from(macroTheses)
      .where(eq(macroTheses.id, thesisId))
      .limit(1);
    if (m) thesis = { ...m, thesisType: 'macro' };
  } else {
    const [a] = await db
      .select({
        id: assetTheses.id, title: assetTheses.title, direction: assetTheses.direction, status: assetTheses.status,
        ticker: underlyings.ticker, spot: underlyings.spot,
      })
      .from(assetTheses)
      .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
      .where(eq(assetTheses.id, thesisId))
      .limit(1);
    if (a) thesis = { ...a, thesisType: 'asset' };
  }
  if (!thesis) return null;

  const sigRows = await db
    .select({
      id: signalsTable.id,
      type: signalsTable.type,
      statement: signalsTable.statement,
      notes: signalsTable.notes,
      linkedClaimIds: signalsTable.linkedClaimIds,
    })
    .from(signalsTable)
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signalsTable.id))
    .where(and(eq(signalEntityLinks.thesisId, thesisId), eq(signalEntityLinks.thesisType, thesisType), eq(signalsTable.status, 'active')));

  const signals: HealthSignal[] = [];
  for (const s of sigRows) {
    const snaps = await db
      .select({
        assessment: signalDataSnapshots.assessment,
        evidenceSummary: signalDataSnapshots.evidenceSummary,
        dataSource: signalDataSnapshots.dataSource,
        snapshotDate: signalDataSnapshots.snapshotDate,
        createdAt: sql<string | null>`${signalDataSnapshots.createdAt}`,
      })
      .from(signalDataSnapshots)
      .where(eq(signalDataSnapshots.signalId, s.id))
      .orderBy(desc(signalDataSnapshots.createdAt))
      .limit(20);

    const lastHealth = snaps.find((x) => x.dataSource === HEALTH_SOURCE);
    const recentEvidence = snaps
      .filter((x) => x.dataSource !== HEALTH_SOURCE)
      .slice(0, evidencePerSignal)
      .map((x) => ({ assessment: x.assessment, evidenceSummary: x.evidenceSummary, dataSource: x.dataSource, snapshotDate: x.snapshotDate, createdAt: x.createdAt }));

    signals.push({
      id: s.id,
      type: s.type,
      statement: s.statement,
      notes: s.notes,
      linkedClaimIds: (s.linkedClaimIds as string[] | null) ?? null,
      lastHealthAssessment: lastHealth?.assessment ?? null,
      recentEvidence,
    });
  }

  return { thesis, signals };
}
