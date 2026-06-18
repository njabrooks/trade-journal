/**
 * Research-gap detection — DB layer (W8 — docs/v2/07 §4e, B6).
 *
 *   1. findResearchGaps — monitoring (live) theses that aren't adequately researched
 *      (the position→backfill inversion: a position opened before the belief exists).
 *   2. gatherGapContext — the thesis + its underlying/theme + whatever little research
 *      already exists, so the bridge can pull Tana first and propose specific sources.
 *
 * The bridge itself (Tana-first pull → relate-research, else a DecisionStrip
 * "develop this thesis" item) is the thesis-review skill (research-gap mode) — a
 * genuine decision point, not automated.
 */
import { db } from '@/db';
import { macroTheses, assetTheses, underlyings, claimThesisMappings, mainClaims, thesisArticulations } from '@/db/schema';
import { eq, and, sql, isNotNull, desc } from 'drizzle-orm';
import { thesisCompleteness, isResearchGap, type CompletenessBand } from '@/lib/derived/thesisCompletenessRules';

export { thesisCompleteness, isResearchGap, COMPLETE_CLAIM_TARGET } from '@/lib/derived/thesisCompletenessRules';
export type { CompletenessBand, CompletenessResult } from '@/lib/derived/thesisCompletenessRules';

export interface ResearchGapItem {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  title: string;
  ticker: string | null;
  claimCount: number;
  hasDigest: boolean;
  digestConfidence: string | null;
  score: number;
  band: CompletenessBand;
  reasons: string[];
}

/** Latest-articulation confidence + existence per `${type}:${id}`. */
async function digestStateByThesis(): Promise<Map<string, { hasDigest: boolean; confidence: string | null }>> {
  const rows = await db
    .select({
      thesisId: thesisArticulations.thesisId,
      thesisType: thesisArticulations.thesisType,
      version: thesisArticulations.version,
      confidence: thesisArticulations.confidenceLevel,
    })
    .from(thesisArticulations);
  // keep the max-version row per thesis
  const best = new Map<string, { version: number; confidence: string | null }>();
  for (const r of rows) {
    const key = `${r.thesisType}:${r.thesisId}`;
    const cur = best.get(key);
    if (!cur || r.version > cur.version) best.set(key, { version: r.version, confidence: r.confidence });
  }
  const out = new Map<string, { hasDigest: boolean; confidence: string | null }>();
  for (const [k, v] of best) out.set(k, { hasDigest: true, confidence: v.confidence });
  return out;
}

async function claimCountByThesis(): Promise<Map<string, number>> {
  const macro = await db
    .select({ thesisId: claimThesisMappings.macroThesisId, n: sql<number>`count(*)::int` })
    .from(claimThesisMappings)
    .where(isNotNull(claimThesisMappings.macroThesisId))
    .groupBy(claimThesisMappings.macroThesisId);
  const asset = await db
    .select({ thesisId: claimThesisMappings.assetThesisId, n: sql<number>`count(*)::int` })
    .from(claimThesisMappings)
    .where(isNotNull(claimThesisMappings.assetThesisId))
    .groupBy(claimThesisMappings.assetThesisId);
  const out = new Map<string, number>();
  for (const r of macro) if (r.thesisId) out.set(`macro:${r.thesisId}`, Number(r.n));
  for (const r of asset) if (r.thesisId) out.set(`asset:${r.thesisId}`, Number(r.n));
  return out;
}

/** Monitoring theses that are research gaps (gap/thin), gap-first then lowest score. */
export async function findResearchGaps(): Promise<ResearchGapItem[]> {
  const macroRows = await db
    .select({ thesisId: macroTheses.id, title: macroTheses.title, status: macroTheses.status })
    .from(macroTheses)
    .where(eq(macroTheses.status, 'monitoring'));
  const assetRows = await db
    .select({ thesisId: assetTheses.id, title: assetTheses.title, status: assetTheses.status, ticker: underlyings.ticker })
    .from(assetTheses)
    .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
    .where(eq(assetTheses.status, 'monitoring'));

  const claims = await claimCountByThesis();
  const digests = await digestStateByThesis();

  const items: ResearchGapItem[] = [];
  for (const r of [
    ...macroRows.map((m) => ({ ...m, thesisType: 'macro' as const, ticker: null as string | null })),
    ...assetRows.map((a) => ({ ...a, thesisType: 'asset' as const })),
  ]) {
    const key = `${r.thesisType}:${r.thesisId}`;
    const claimCount = claims.get(key) ?? 0;
    const digest = digests.get(key);
    const hasDigest = digest?.hasDigest ?? false;
    const digestConfidence = digest?.confidence ?? null;
    const { score, band, reasons } = thesisCompleteness({ claimCount, hasDigest, digestConfidence });
    if (isResearchGap(r.status, band)) {
      items.push({ thesisId: r.thesisId, thesisType: r.thesisType, title: r.title, ticker: r.ticker, claimCount, hasDigest, digestConfidence, score, band, reasons });
    }
  }
  const bandRank = { gap: 0, thin: 1, adequate: 2 } as const;
  items.sort((a, b) => bandRank[a.band] - bandRank[b.band] || a.score - b.score);
  return items;
}

export interface GapContext {
  thesis: {
    id: string;
    thesisType: 'macro' | 'asset';
    title: string;
    description: string | null;
    direction: string | null;
    ticker: string | null;
    sectors?: string[] | null;
    themes?: string[] | null;
  };
  completeness: { score: number; band: CompletenessBand; reasons: string[] };
  /** Titles of whatever claims already exist (to avoid re-pulling them). */
  existingClaimTitles: string[];
  hasDigest: boolean;
}

/** Context for the bridge: what the thesis is about + what little research exists. */
export async function gatherGapContext(thesisId: string, thesisType: 'macro' | 'asset'): Promise<GapContext | null> {
  let thesis: GapContext['thesis'] | null = null;
  if (thesisType === 'macro') {
    const [m] = await db
      .select({ id: macroTheses.id, title: macroTheses.title, description: macroTheses.description, direction: macroTheses.direction, sectors: macroTheses.sectors, themes: macroTheses.themes })
      .from(macroTheses)
      .where(eq(macroTheses.id, thesisId))
      .limit(1);
    if (m) thesis = { ...m, thesisType: 'macro', ticker: null };
  } else {
    const [a] = await db
      .select({ id: assetTheses.id, title: assetTheses.title, description: assetTheses.description, direction: assetTheses.direction, ticker: underlyings.ticker })
      .from(assetTheses)
      .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
      .where(eq(assetTheses.id, thesisId))
      .limit(1);
    if (a) thesis = { ...a, thesisType: 'asset' };
  }
  if (!thesis) return null;

  const claimRows = await db
    .select({ title: mainClaims.title })
    .from(claimThesisMappings)
    .innerJoin(mainClaims, eq(mainClaims.id, claimThesisMappings.mainClaimId))
    .where(thesisType === 'macro' ? eq(claimThesisMappings.macroThesisId, thesisId) : eq(claimThesisMappings.assetThesisId, thesisId));

  const [latest] = await db
    .select({ confidence: thesisArticulations.confidenceLevel })
    .from(thesisArticulations)
    .where(and(eq(thesisArticulations.thesisId, thesisId), eq(thesisArticulations.thesisType, thesisType)))
    .orderBy(desc(thesisArticulations.version))
    .limit(1);

  const completeness = thesisCompleteness({
    claimCount: claimRows.length,
    hasDigest: !!latest,
    digestConfidence: latest?.confidence ?? null,
  });

  return {
    thesis,
    completeness: { score: completeness.score, band: completeness.band, reasons: completeness.reasons },
    existingClaimTitles: claimRows.map((c) => c.title),
    hasDigest: !!latest,
  };
}
