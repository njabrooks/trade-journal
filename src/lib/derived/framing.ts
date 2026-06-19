/**
 * Asset→macro framing detection — DB layer (C5a — docs/v2/09 §7; 08 outstanding #4).
 *
 *   1. findThesesNeedingFraming — live asset theses with NO macro link (a coverage gap).
 *   2. gatherFramingContext — that asset thesis + the macro catalog to judge it against +
 *      its existing claim titles (theme signal).
 *
 * The judgment (which macro genuinely frames the asset, related vs gated_by) is the
 * thesis-review skill (framing mode): a high-confidence `related` auto-links; `gated_by`
 * or an uncertain match raises a classify_macro_link decision (framingRules.framingDisposition).
 */
import { db } from '@/db';
import { macroTheses, assetTheses, underlyings, assetThesisRelatedMacroTheses, claimThesisMappings, mainClaims } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { needsFraming } from '@/lib/derived/framingRules';

export { needsFraming, framingDisposition, AUTO_RELATED_CONFIDENCE } from '@/lib/derived/framingRules';

const ACTIVE = ['developing', 'monitoring'] as const;

export interface FramingItem {
  thesisId: string;
  thesisType: 'asset';
  title: string;
  ticker: string | null;
  direction: string | null;
  status: string;
}

/** Live asset theses with zero macro links — candidates the agent judges for framing. */
export async function findThesesNeedingFraming(): Promise<FramingItem[]> {
  const linkRows = await db
    .select({ assetThesisId: assetThesisRelatedMacroTheses.assetThesisId, n: sql<number>`count(*)::int` })
    .from(assetThesisRelatedMacroTheses)
    .groupBy(assetThesisRelatedMacroTheses.assetThesisId);
  const linkCount = new Map<string, number>();
  for (const r of linkRows) linkCount.set(r.assetThesisId, Number(r.n));

  const rows = await db
    .select({
      thesisId: assetTheses.id,
      title: assetTheses.title,
      direction: assetTheses.direction,
      status: assetTheses.status,
      ticker: underlyings.ticker,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
    .where(inArray(assetTheses.status, [...ACTIVE]));

  return rows
    .filter((r) => needsFraming({ status: r.status, macroLinkCount: linkCount.get(r.thesisId) ?? 0 }))
    .map((r) => ({ thesisId: r.thesisId, thesisType: 'asset' as const, title: r.title, ticker: r.ticker, direction: r.direction, status: r.status }));
}

export interface MacroCatalogEntry {
  id: string;
  title: string;
  direction: string | null;
  thesisType: string | null;
  sectors: string[] | null;
  themes: string[] | null;
  description: string | null;
}

export interface FramingContext {
  thesis: {
    id: string;
    title: string;
    description: string | null;
    narrative: string | null;
    direction: string | null;
    ticker: string | null;
  };
  existingClaimTitles: string[];
  /** The active macro theses to frame the asset against (the agent picks 0–N). */
  macroCatalog: MacroCatalogEntry[];
}

/** Context for the framing judgment: the asset thesis + its claims + the macro catalog. */
export async function gatherFramingContext(assetThesisId: string): Promise<FramingContext | null> {
  const [a] = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      description: assetTheses.description,
      narrative: assetTheses.narrative,
      direction: assetTheses.direction,
      ticker: underlyings.ticker,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
    .where(eq(assetTheses.id, assetThesisId))
    .limit(1);
  if (!a) return null;

  const claimRows = await db
    .select({ title: mainClaims.title })
    .from(claimThesisMappings)
    .innerJoin(mainClaims, eq(mainClaims.id, claimThesisMappings.mainClaimId))
    .where(eq(claimThesisMappings.assetThesisId, assetThesisId));

  const macros = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
      direction: macroTheses.direction,
      thesisType: macroTheses.thesisType,
      sectors: macroTheses.sectors,
      themes: macroTheses.themes,
      description: macroTheses.description,
    })
    .from(macroTheses)
    .where(inArray(macroTheses.status, [...ACTIVE]));

  return {
    thesis: { id: a.id, title: a.title, description: a.description, narrative: a.narrative, direction: a.direction, ticker: a.ticker },
    existingClaimTitles: claimRows.map((c) => c.title),
    macroCatalog: macros,
  };
}
