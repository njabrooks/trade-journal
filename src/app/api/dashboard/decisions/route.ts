import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { journalEntries } from '@/db/schema';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { isUuid } from '@/lib/utils';
import { getDecisionPacket, type DecisionResolution } from '@/lib/types/decisions';

export const dynamic = 'force-dynamic';

/**
 * "Needs decision" strip (docs/v2/09 §8) — the only inbox-like element.
 * Claude review jobs (relate-research / /thesis-review) write journal entries with
 * action_type='decision_required' and (when typed) a decision packet at
 * metadata.decision. The strip surfaces ACTIVE ones, hard-capped, newest first.
 * Dismissing sets status='dismissed'; snoozing hides until snoozed_until passes;
 * resolving records a resolution into the packet.
 *
 * GET honours `?limit=<n>|all` (default HARD_CAP, for the strip) and always returns
 * `total` — the full active count — so the strip count stays honest past the cap and
 * the /decisions page (Lane B, docs/v2/20) can render everything.
 */
const HARD_CAP = 5;

/** snoozed_until can live in the packet (metadata.decision) or, for legacy bare rows, at metadata top-level. */
const SNOOZED_UNTIL_SQL = sql`COALESCE(${journalEntries.metadata}->'decision'->>'snoozed_until', ${journalEntries.metadata}->>'snoozed_until')`;

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit =
      limitParam === 'all'
        ? null
        : Math.max(1, Number.parseInt(limitParam ?? '', 10) || HARD_CAP);

    // Self-heal: wake any snoozed decision whose snooze has expired (idempotent).
    await db
      .update(journalEntries)
      .set({ status: 'active' })
      .where(
        and(
          eq(journalEntries.actionType, 'decision_required'),
          eq(journalEntries.status, 'snoozed'),
          sql`${SNOOZED_UNTIL_SQL} IS NOT NULL`,
          sql`(${SNOOZED_UNTIL_SQL})::timestamptz <= now()`
        )
      );

    const activeWhere = and(
      eq(journalEntries.actionType, 'decision_required'),
      eq(journalEntries.status, 'active')
    );

    const baseQuery = db
      .select({
        id: journalEntries.id,
        objectType: journalEntries.objectType,
        objectId: journalEntries.objectId,
        objectTitle: journalEntries.objectTitle,
        actionDescription: journalEntries.actionDescription,
        rationale: journalEntries.rationale,
        timestamp: journalEntries.timestamp,
        source: journalEntries.source,
        metadata: journalEntries.metadata,
      })
      .from(journalEntries)
      .where(activeWhere)
      .orderBy(desc(journalEntries.timestamp));

    const rows = limit ? await baseQuery.limit(limit) : await baseQuery;

    let total = rows.length;
    if (limit && rows.length === limit) {
      const [{ n }] = await db.select({ n: count() }).from(journalEntries).where(activeWhere);
      total = n;
    }

    const decisions = rows.map(({ metadata, ...rest }) => ({
      ...rest,
      decision: getDecisionPacket(metadata),
    }));

    return NextResponse.json({ decisions, total });
  } catch (error) {
    console.error('Error fetching decisions:', error);
    return NextResponse.json({ error: 'Failed to fetch decisions' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, snoozedUntil, resolution } = body as {
      id?: string;
      status?: string;
      snoozedUntil?: string;
      resolution?: Partial<DecisionResolution>;
    };

    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });
    }
    if (status !== 'dismissed' && status !== 'resolved' && status !== 'snoozed') {
      return NextResponse.json(
        { error: "status must be 'dismissed', 'resolved', or 'snoozed'" },
        { status: 400 }
      );
    }
    if (status === 'snoozed' && (!snoozedUntil || Number.isNaN(Date.parse(snoozedUntil)))) {
      return NextResponse.json(
        { error: "snoozedUntil (ISO date) is required to snooze" },
        { status: 400 }
      );
    }

    const existing = await db
      .select({ metadata: journalEntries.metadata })
      .from(journalEntries)
      .where(
        and(eq(journalEntries.id, id), eq(journalEntries.actionType, 'decision_required'))
      )
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    // Read-modify-write the metadata jsonb so legacy bare rows and packet rows both work.
    const meta = (existing[0].metadata ?? {}) as Record<string, unknown>;
    const hasPacket = !!meta.decision && typeof meta.decision === 'object';
    const target = (hasPacket ? meta.decision : meta) as Record<string, unknown>;

    if (status === 'snoozed') {
      target.snoozed_until = snoozedUntil;
    } else {
      const res: DecisionResolution = {
        action_taken: resolution?.action_taken ?? (status === 'dismissed' ? 'dismissed' : 'resolved'),
        chosen_by: resolution?.chosen_by ?? 'user',
        at: resolution?.at ?? new Date().toISOString(),
        ...(resolution?.notes ? { notes: resolution.notes } : {}),
        ...(resolution?.writes ? { writes: resolution.writes } : {}),
      };
      target.resolution = res;
    }

    await db
      .update(journalEntries)
      .set({ status, metadata: meta })
      .where(
        and(eq(journalEntries.id, id), eq(journalEntries.actionType, 'decision_required'))
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating decision:', error);
    return NextResponse.json({ error: 'Failed to update decision' }, { status: 500 });
  }
}
