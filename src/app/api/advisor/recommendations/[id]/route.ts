import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  advisorRecommendations,
  assetTheses,
  journalEntries,
  underlyings,
} from '@/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { isUuid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface StructureLeg {
  action?: string;
  right?: string;
  strike?: number;
  expiry?: string;
}

interface RecommendationStructure {
  type?: string;
  legs?: StructureLeg[];
}

function describeStructure(structure: RecommendationStructure, ticker: string): string {
  const legs = structure?.legs ?? [];
  const strikes = legs.map((l) => l.strike).filter((s) => s != null).join('/');
  const expiry = legs[0]?.expiry ?? '';
  return `${ticker} ${strikes} ${structure?.type ?? 'structure'} ${expiry}`.trim();
}

/**
 * The recommendation's ticker → its active asset thesis (developing/monitoring),
 * following parent_underlying_id one hop (IBIT→BTC) like the strategy auto-linker.
 */
async function resolveAssetThesis(
  ticker: string
): Promise<{ id: string; title: string; status: string } | null> {
  const [u] = await db
    .select({ id: underlyings.id, parentUnderlyingId: underlyings.parentUnderlyingId })
    .from(underlyings)
    .where(eq(underlyings.ticker, ticker.toUpperCase()))
    .limit(1);
  if (!u) return null;

  const candidateIds = [u.id, ...(u.parentUnderlyingId ? [u.parentUnderlyingId] : [])];
  for (const underlyingId of candidateIds) {
    const [thesis] = await db
      .select({ id: assetTheses.id, title: assetTheses.title, status: assetTheses.status })
      .from(assetTheses)
      .where(
        and(
          eq(assetTheses.underlyingId, underlyingId),
          inArray(assetTheses.status, ['developing', 'monitoring'])
        )
      )
      .orderBy(desc(assetTheses.updatedAt))
      .limit(1);
    if (thesis) return thesis;
  }
  return null;
}

/**
 * Lane C (docs/v2/20) — close the advisor loop.
 * PATCH { status: 'acted' | 'dismissed' }
 *   acted     → creates a trade_action journal entry (attached to the ticker's asset
 *               thesis when one exists) capturing the structure + expected edge at entry,
 *               stamps acted_at/acted_journal_id.
 *   dismissed → plain status update; the explicit "no" that makes expiry meaningful.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });
    }

    const body = await request.json();
    const { status } = body as { status?: string };
    if (status !== 'acted' && status !== 'dismissed') {
      return NextResponse.json(
        { error: "status must be 'acted' or 'dismissed'" },
        { status: 400 }
      );
    }

    const [rec] = await db
      .select()
      .from(advisorRecommendations)
      .where(eq(advisorRecommendations.id, id))
      .limit(1);
    if (!rec) {
      return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    if (status === 'dismissed') {
      await db
        .update(advisorRecommendations)
        .set({ status: 'dismissed', updatedAt: new Date() })
        .where(eq(advisorRecommendations.id, id));
      return NextResponse.json({ success: true, status: 'dismissed' });
    }

    // acted — idempotence guard: recording twice would mint duplicate journal entries
    if (rec.status === 'acted') {
      return NextResponse.json(
        { error: 'Recommendation is already recorded as acted' },
        { status: 409 }
      );
    }

    const structure = rec.structure as RecommendationStructure;
    const thesis = await resolveAssetThesis(rec.ticker);
    const now = new Date();

    const [journal] = await db
      .insert(journalEntries)
      .values({
        objectType: thesis ? 'asset_thesis' : 'advisor_recommendation',
        objectId: thesis ? thesis.id : rec.id,
        objectTitle: thesis ? thesis.title : `${rec.ticker} advisor recommendation`,
        actionType: 'trade_action',
        actionDescription: `Acted on advisor ${rec.scenario} recommendation: ${describeStructure(structure, rec.ticker)}`,
        source: 'user',
        metadata: {
          recommendationId: rec.id,
          scenario: rec.scenario,
          ticker: rec.ticker,
          structure,
          // expected premium/edge at entry — frozen so the scoring pass compares
          // against what the advisor promised, not a later re-read of the surface
          expected: rec.metrics,
          volContext: rec.volContext,
          thesis: thesis
            ? { assetThesisId: thesis.id, title: thesis.title, status: thesis.status }
            : null,
        },
        timestamp: now,
      })
      .returning({ id: journalEntries.id });

    await db
      .update(advisorRecommendations)
      .set({ status: 'acted', actedAt: now, actedJournalId: journal.id, updatedAt: now })
      .where(eq(advisorRecommendations.id, id));

    return NextResponse.json({ success: true, status: 'acted', journalEntryId: journal.id });
  } catch (error) {
    console.error('Error updating recommendation:', error);
    return NextResponse.json({ error: 'Failed to update recommendation' }, { status: 500 });
  }
}
