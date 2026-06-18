/**
 * Auto digest synthesis — DB layer (W8 — docs/v2/07 §4a, B4).
 *
 * Two responsibilities:
 *   1. findThesesNeedingDigestRefresh — the delta-triggered worklist (which
 *      developing theses have accumulated enough new claims to re-synthesize).
 *   2. gatherDigestContext — assemble everything the thesis-review skill needs to
 *      synthesize a thesis's supporting digest (thesis fields + Toulmin claims).
 *
 * The pure trigger rule lives in ./digestTriggerRules (DB-free, unit-tested).
 * The synthesis itself is the thesis-review skill (Claude); the write goes through
 * scripts/insert-thesis-articulation.ts with empty signals (digest only — no
 * signal derivation, no promotion; those are B5).
 */
import { db } from '@/db';
import { macroTheses, assetTheses, claimThesisMappings, mainClaims, thesisArticulations, underlyings } from '@/db/schema';
import { eq, and, desc, sql, isNotNull } from 'drizzle-orm';
import { needsDigestRefresh, DIGEST_REFRESH_DELTA_K } from '@/lib/derived/digestTriggerRules';

export { needsDigestRefresh, DIGEST_REFRESH_DELTA_K } from '@/lib/derived/digestTriggerRules';
export type { DigestTriggerInputs } from '@/lib/derived/digestTriggerRules';

export interface DigestWorklistItem {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  title: string;
  status: string;
  currentClaimCount: number;
  claimsCountAtLastArticulation: number;
  delta: number;
  hasArticulation: boolean;
  latestVersion: number | null;
}

/**
 * Developing theses whose digest should be (re)synthesized now (claim delta ≥ k).
 * Pre-filters to `developing` in SQL, then applies the pure rule as the single
 * source of truth.
 */
export async function findThesesNeedingDigestRefresh(k = DIGEST_REFRESH_DELTA_K): Promise<DigestWorklistItem[]> {
  // Developing theses (id/title/last-count) per level.
  const macroRows = await db
    .select({ thesisId: macroTheses.id, title: macroTheses.title, status: macroTheses.status, lastCount: macroTheses.claimsCountAtLastArticulation })
    .from(macroTheses)
    .where(eq(macroTheses.status, 'developing'));
  const assetRows = await db
    .select({ thesisId: assetTheses.id, title: assetTheses.title, status: assetTheses.status, lastCount: assetTheses.claimsCountAtLastArticulation })
    .from(assetTheses)
    .where(eq(assetTheses.status, 'developing'));

  // Claim counts + latest articulation versions via grouped queries joined in JS.
  // (Drizzle correlated subqueries referencing the outer table don't correlate
  // reliably inside a select — they silently return 0/null; group-and-map instead,
  // the same pattern used by thesisCascade.)
  const macroClaimRows = await db
    .select({ thesisId: claimThesisMappings.macroThesisId, n: sql<number>`count(*)::int` })
    .from(claimThesisMappings)
    .where(isNotNull(claimThesisMappings.macroThesisId))
    .groupBy(claimThesisMappings.macroThesisId);
  const assetClaimRows = await db
    .select({ thesisId: claimThesisMappings.assetThesisId, n: sql<number>`count(*)::int` })
    .from(claimThesisMappings)
    .where(isNotNull(claimThesisMappings.assetThesisId))
    .groupBy(claimThesisMappings.assetThesisId);
  const versionRows = await db
    .select({ thesisId: thesisArticulations.thesisId, thesisType: thesisArticulations.thesisType, maxV: sql<number>`max(${thesisArticulations.version})::int` })
    .from(thesisArticulations)
    .groupBy(thesisArticulations.thesisId, thesisArticulations.thesisType);

  const claimCountFor = new Map<string, number>();
  for (const r of macroClaimRows) if (r.thesisId) claimCountFor.set(`macro:${r.thesisId}`, Number(r.n));
  for (const r of assetClaimRows) if (r.thesisId) claimCountFor.set(`asset:${r.thesisId}`, Number(r.n));
  const versionFor = new Map<string, number>();
  for (const r of versionRows) versionFor.set(`${r.thesisType}:${r.thesisId}`, Number(r.maxV));

  const all: DigestWorklistItem[] = [
    ...macroRows.map((r) => ({ ...r, thesisType: 'macro' as const })),
    ...assetRows.map((r) => ({ ...r, thesisType: 'asset' as const })),
  ].map((r) => {
    const key = `${r.thesisType}:${r.thesisId}`;
    const currentClaimCount = claimCountFor.get(key) ?? 0;
    const claimsCountAtLastArticulation = Number(r.lastCount ?? 0);
    const latestVersion = versionFor.get(key) ?? null;
    return {
      thesisId: r.thesisId,
      thesisType: r.thesisType,
      title: r.title,
      status: r.status,
      currentClaimCount,
      claimsCountAtLastArticulation,
      delta: currentClaimCount - claimsCountAtLastArticulation,
      hasArticulation: latestVersion != null,
      latestVersion,
    };
  });

  return all
    .filter((t) =>
      needsDigestRefresh({
        status: t.status,
        currentClaimCount: t.currentClaimCount,
        claimsCountAtLastArticulation: t.claimsCountAtLastArticulation,
        hasArticulation: t.hasArticulation,
        k,
      }),
    )
    .sort((a, b) => b.delta - a.delta);
}

export interface DigestClaim {
  id: string;
  title: string;
  claim: string;
  category: string | null;
  evidence: string[] | null;
  reasoning: string | null;
  backing: string | null;
  qualifier: string | null;
  rebuttal: string[] | null;
  relevantTickers: string[] | null;
  status: string;
  mappingType: string;
  confidence: string | null;
}

export interface DigestContext {
  thesis: {
    id: string;
    thesisType: 'macro' | 'asset';
    title: string;
    description: string | null;
    direction: string | null;
    timeHorizon: string | null;
    confidenceLevel: string | null;
    status: string;
    sectors?: string[] | null;
    themes?: string[] | null;
    ticker?: string | null;
    narrative?: string | null;
    targetPrice?: string | null;
  };
  /** mapping_type in (supports, foundation) */
  supportingClaims: DigestClaim[];
  /** mapping_type = refutes — feed evidence_gaps + pre-stage invalidation */
  refutingClaims: DigestClaim[];
  /** Latest existing digest, for continuity on re-synthesis (null if first). */
  latestArticulation: { version: number; coreArgument: string; createdAt: Date } | null;
}

/** Assemble the synthesis inputs for one thesis's supporting digest. */
export async function gatherDigestContext(
  thesisId: string,
  thesisType: 'macro' | 'asset',
): Promise<DigestContext | null> {
  let thesisInfo: DigestContext['thesis'] | null = null;

  if (thesisType === 'macro') {
    const [m] = await db
      .select({
        id: macroTheses.id,
        title: macroTheses.title,
        description: macroTheses.description,
        direction: macroTheses.direction,
        timeHorizon: macroTheses.timeHorizon,
        confidenceLevel: macroTheses.confidenceLevel,
        status: macroTheses.status,
        sectors: macroTheses.sectors,
        themes: macroTheses.themes,
      })
      .from(macroTheses)
      .where(eq(macroTheses.id, thesisId))
      .limit(1);
    if (m) thesisInfo = { ...m, thesisType: 'macro' };
  } else {
    const [a] = await db
      .select({
        id: assetTheses.id,
        title: assetTheses.title,
        description: assetTheses.description,
        narrative: assetTheses.narrative,
        direction: assetTheses.direction,
        timeHorizon: assetTheses.timeHorizon,
        confidenceLevel: assetTheses.confidenceLevel,
        status: assetTheses.status,
        targetPrice: assetTheses.targetPrice,
        ticker: underlyings.ticker,
      })
      .from(assetTheses)
      .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
      .where(eq(assetTheses.id, thesisId))
      .limit(1);
    if (a) thesisInfo = { ...a, thesisType: 'asset' };
  }

  if (!thesisInfo) return null;

  const claimRows = await db
    .select({
      id: mainClaims.id,
      title: mainClaims.title,
      claim: mainClaims.claim,
      category: mainClaims.category,
      evidence: mainClaims.evidence,
      reasoning: mainClaims.reasoning,
      backing: mainClaims.backing,
      qualifier: mainClaims.qualifier,
      rebuttal: mainClaims.rebuttal,
      relevantTickers: mainClaims.relevantTickers,
      status: mainClaims.status,
      mappingType: claimThesisMappings.mappingType,
      confidence: claimThesisMappings.confidence,
    })
    .from(claimThesisMappings)
    .innerJoin(mainClaims, eq(mainClaims.id, claimThesisMappings.mainClaimId))
    .where(
      thesisType === 'macro'
        ? eq(claimThesisMappings.macroThesisId, thesisId)
        : eq(claimThesisMappings.assetThesisId, thesisId),
    );

  const supportingClaims = claimRows.filter((c) => c.mappingType !== 'refutes');
  const refutingClaims = claimRows.filter((c) => c.mappingType === 'refutes');

  const [latest] = await db
    .select({
      version: thesisArticulations.version,
      coreArgument: thesisArticulations.coreArgument,
      createdAt: thesisArticulations.createdAt,
    })
    .from(thesisArticulations)
    .where(and(eq(thesisArticulations.thesisId, thesisId), eq(thesisArticulations.thesisType, thesisType)))
    .orderBy(desc(thesisArticulations.version))
    .limit(1);

  return {
    thesis: thesisInfo,
    supportingClaims,
    refutingClaims,
    latestArticulation: latest ?? null,
  };
}
