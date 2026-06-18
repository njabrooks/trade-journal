/**
 * Signal derivation — DB layer (W8 — docs/v2/07 §4b, B5).
 *
 *   1. findMonitoringThesesNeedingSignals — the worklist of monitoring theses that
 *      have no active signals yet (split into `ready` = has claims to derive from,
 *      and `thin` = no claims, a research-gap candidate for B6/§4e).
 *   2. gatherSignalContext — the synthesis bundle: the digest context (thesis +
 *      Toulmin claims + latest digest) plus the parent macro theses an asset thesis
 *      depends on, for compositional invalidation signals (§4b).
 *
 * The derivation itself is the thesis-review skill (signal mode); it writes via
 * scripts/insert-thesis-articulation.ts with the signals array populated — that
 * path inserts the signals (status active, category judgment), supersedes any
 * stale ones, and (post-B5a) leaves thesis status to the cascade.
 */
import { db } from '@/db';
import {
  macroTheses,
  assetTheses,
  claimThesisMappings,
  signals as signalsTable,
  signalEntityLinks,
  assetThesisRelatedMacroTheses,
} from '@/db/schema';
import { eq, and, sql, isNotNull } from 'drizzle-orm';
import { signalDerivationAction } from '@/lib/derived/signalDerivationRules';
import { gatherDigestContext, type DigestContext } from '@/lib/derived/digestSynthesis';

export { signalDerivationAction } from '@/lib/derived/signalDerivationRules';
export type { SignalDerivationInputs, SignalDerivationAction } from '@/lib/derived/signalDerivationRules';

export interface SignalWorklistItem {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  title: string;
  claimCount: number;
  activeSignalCount: number;
  hasDigest: boolean;
}

export interface SignalWorklist {
  /** Monitoring, no active signals, ≥1 claim — derive digest + signals. */
  ready: SignalWorklistItem[];
  /** Monitoring, no active signals, no claims — research-gap (B6/§4e); do NOT fabricate. */
  thin: SignalWorklistItem[];
}

/** Monitoring theses that have no active signals yet, partitioned into derivable vs thin. */
export async function findMonitoringThesesNeedingSignals(): Promise<SignalWorklist> {
  const macroRows = await db
    .select({ thesisId: macroTheses.id, title: macroTheses.title, status: macroTheses.status })
    .from(macroTheses)
    .where(eq(macroTheses.status, 'monitoring'));
  const assetRows = await db
    .select({ thesisId: assetTheses.id, title: assetTheses.title, status: assetTheses.status })
    .from(assetTheses)
    .where(eq(assetTheses.status, 'monitoring'));

  // Claim counts (grouped, joined in JS — Drizzle correlated subqueries don't correlate in a select).
  const macroClaims = await db
    .select({ thesisId: claimThesisMappings.macroThesisId, n: sql<number>`count(*)::int` })
    .from(claimThesisMappings)
    .where(isNotNull(claimThesisMappings.macroThesisId))
    .groupBy(claimThesisMappings.macroThesisId);
  const assetClaims = await db
    .select({ thesisId: claimThesisMappings.assetThesisId, n: sql<number>`count(*)::int` })
    .from(claimThesisMappings)
    .where(isNotNull(claimThesisMappings.assetThesisId))
    .groupBy(claimThesisMappings.assetThesisId);
  const claimCountFor = new Map<string, number>();
  for (const r of macroClaims) if (r.thesisId) claimCountFor.set(`macro:${r.thesisId}`, Number(r.n));
  for (const r of assetClaims) if (r.thesisId) claimCountFor.set(`asset:${r.thesisId}`, Number(r.n));

  // Active signal counts per thesis (via the junction).
  const sigRows = await db
    .select({
      thesisId: signalEntityLinks.thesisId,
      thesisType: signalEntityLinks.thesisType,
      n: sql<number>`count(*)::int`,
    })
    .from(signalEntityLinks)
    .innerJoin(signalsTable, eq(signalsTable.id, signalEntityLinks.signalId))
    .where(and(eq(signalsTable.status, 'active'), isNotNull(signalEntityLinks.thesisId)))
    .groupBy(signalEntityLinks.thesisId, signalEntityLinks.thesisType);
  const activeSignalFor = new Map<string, number>();
  for (const r of sigRows) if (r.thesisId) activeSignalFor.set(`${r.thesisType}:${r.thesisId}`, Number(r.n));

  // Which theses have any digest at all.
  const digestRows = await db
    .select({ thesisId: sql<string>`thesis_id`, thesisType: sql<string>`thesis_type` })
    .from(sql`(select distinct thesis_id, thesis_type from thesis_articulations) ta`);
  const hasDigest = new Set<string>();
  for (const r of digestRows) hasDigest.add(`${r.thesisType}:${r.thesisId}`);

  const ready: SignalWorklistItem[] = [];
  const thin: SignalWorklistItem[] = [];

  for (const r of [
    ...macroRows.map((m) => ({ ...m, thesisType: 'macro' as const })),
    ...assetRows.map((a) => ({ ...a, thesisType: 'asset' as const })),
  ]) {
    const key = `${r.thesisType}:${r.thesisId}`;
    const claimCount = claimCountFor.get(key) ?? 0;
    const activeSignalCount = activeSignalFor.get(key) ?? 0;
    const item: SignalWorklistItem = {
      thesisId: r.thesisId,
      thesisType: r.thesisType,
      title: r.title,
      claimCount,
      activeSignalCount,
      hasDigest: hasDigest.has(key),
    };
    const action = signalDerivationAction({ status: r.status, activeSignalCount, claimCount });
    if (action === 'derive') ready.push(item);
    else if (action === 'thin') thin.push(item);
  }

  ready.sort((a, b) => b.claimCount - a.claimCount);
  thin.sort((a, b) => a.title.localeCompare(b.title));
  return { ready, thin };
}

export interface ParentMacroRef {
  macroThesisId: string;
  title: string;
  relationshipType: string;
}

export interface SignalContext extends DigestContext {
  /** Parent macro theses this (asset) thesis is linked to — sources for compositional invalidation signals. */
  parentMacros: ParentMacroRef[];
}

/** Synthesis bundle for signal derivation: digest context + parent-macro dependencies. */
export async function gatherSignalContext(
  thesisId: string,
  thesisType: 'macro' | 'asset',
): Promise<SignalContext | null> {
  const digest = await gatherDigestContext(thesisId, thesisType);
  if (!digest) return null;

  let parentMacros: ParentMacroRef[] = [];
  if (thesisType === 'asset') {
    const rows = await db
      .select({
        macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
        title: macroTheses.title,
        relationshipType: assetThesisRelatedMacroTheses.relationshipType,
      })
      .from(assetThesisRelatedMacroTheses)
      .innerJoin(macroTheses, eq(macroTheses.id, assetThesisRelatedMacroTheses.macroThesisId))
      .where(eq(assetThesisRelatedMacroTheses.assetThesisId, thesisId));
    parentMacros = rows.map((r) => ({ macroThesisId: r.macroThesisId, title: r.title, relationshipType: r.relationshipType }));
  }

  return { ...digest, parentMacros };
}
