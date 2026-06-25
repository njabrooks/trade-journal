/**
 * Macro emergence detection — DB layer (docs/v2/13 §1, structure-driven entry point).
 *
 * The complement to framing. Framing asks "does an EXISTING macro frame this asset?" and
 * links it; the assets it skips (no existing macro fits) are exactly where emergence picks
 * up: when SEVERAL unframed assets share a genuine macro-level theme and none of the active
 * macros covers it, that cluster is a candidate for a NEW macro thesis.
 *
 * This layer only assembles the pool (active asset theses with no macro link) + the macro
 * catalog for dedup. The CLUSTERING JUDGMENT — which assets form a genuine emergent theme,
 * whether an existing macro already covers it — is the thesis-review skill (macro-emergence
 * mode), exactly as framing keeps its judgment in the skill. Creating a belief is always a
 * decision: the skill raises a `cluster_claims_to_thesis` packet, never auto-creates.
 */
import { db } from '@/db';
import { macroTheses, assetTheses, underlyings, assetThesisRelatedMacroTheses, claimThesisMappings, mainClaims } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import type { MacroCatalogEntry } from '@/lib/derived/framing';

const ACTIVE = ['developing', 'monitoring'] as const;

export interface UnframedAsset {
  thesisId: string;
  title: string;
  description: string | null;
  direction: string | null;
  ticker: string | null;
  status: string;
  /** theme signal for clustering — titles of the asset's linked claims */
  claimTitles: string[];
}

export interface EmergenceContext {
  /** active asset theses with no macro link — the pool the skill clusters into emergent macros */
  unframedAssets: UnframedAsset[];
  /** active macros — propose a NEW macro only when none of these covers the cluster (the dedup boundary) */
  macroCatalog: MacroCatalogEntry[];
}

/** The emergence judgment context: the unframed-asset pool + the macro catalog to dedup against. */
export async function gatherEmergenceContext(): Promise<EmergenceContext> {
  // Asset theses already linked to a macro — excluded from the pool.
  const linkRows = await db
    .select({ assetThesisId: assetThesisRelatedMacroTheses.assetThesisId })
    .from(assetThesisRelatedMacroTheses);
  const linked = new Set(linkRows.map((r) => r.assetThesisId));

  const assetRows = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      description: assetTheses.description,
      direction: assetTheses.direction,
      status: assetTheses.status,
      ticker: underlyings.ticker,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
    .where(inArray(assetTheses.status, [...ACTIVE]));
  const unframedRows = assetRows.filter((a) => !linked.has(a.id));

  // Claim titles per unframed asset (the theme signal the skill clusters on).
  const ids = unframedRows.map((a) => a.id);
  const claimsByAsset = new Map<string, string[]>();
  if (ids.length > 0) {
    const claimRows = await db
      .select({ assetThesisId: claimThesisMappings.assetThesisId, title: mainClaims.title })
      .from(claimThesisMappings)
      .innerJoin(mainClaims, eq(mainClaims.id, claimThesisMappings.mainClaimId))
      .where(inArray(claimThesisMappings.assetThesisId, ids));
    for (const c of claimRows) {
      if (!c.assetThesisId) continue;
      const arr = claimsByAsset.get(c.assetThesisId) ?? [];
      arr.push(c.title);
      claimsByAsset.set(c.assetThesisId, arr);
    }
  }

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
    unframedAssets: unframedRows.map((a) => ({
      thesisId: a.id,
      title: a.title,
      description: a.description,
      direction: a.direction,
      ticker: a.ticker,
      status: a.status,
      claimTitles: claimsByAsset.get(a.id) ?? [],
    })),
    macroCatalog: macros,
  };
}
