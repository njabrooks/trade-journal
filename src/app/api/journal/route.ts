import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { journalEntries } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const objectType = searchParams.get('objectType');
    const actionType = searchParams.get('actionType');
    const source = searchParams.get('source');
    const search = searchParams.get('search');
    const underlying = searchParams.get('underlying');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 1000);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build WHERE clause dynamically on the journal_entries_with_underlying view
    let where = sql`WHERE TRUE`;
    if (objectType) where = sql`${where} AND object_type = ${objectType}`;
    if (actionType) where = sql`${where} AND action_type = ${actionType}`;
    if (source) where = sql`${where} AND source = ${source}`;
    if (underlying) where = sql`${where} AND underlying_ticker = ${underlying}`;
    if (search) {
      const pattern = `%${search}%`;
      where = sql`${where} AND (object_title ILIKE ${pattern} OR action_description ILIKE ${pattern} OR rationale ILIKE ${pattern})`;
    }
    if (startDate) where = sql`${where} AND timestamp >= ${startDate}::timestamptz`;
    if (endDate) where = sql`${where} AND timestamp <= ${endDate}::timestamptz`;

    // Query entries with underlying tickers aggregated (same pattern as page.tsx)
    const entriesResult = await db.execute(sql`
      SELECT
        id,
        timestamp,
        object_type AS "objectType",
        object_id AS "objectId",
        object_title AS "objectTitle",
        action_type AS "actionType",
        action_description AS "actionDescription",
        triage_record_id AS "triageRecordId",
        skill_invoked AS "skillInvoked",
        previous_state AS "previousState",
        new_state AS "newState",
        rationale,
        source,
        metadata,
        batch_id AS "batchId",
        first_detected_at AS "firstDetectedAt",
        last_seen_at AS "lastSeenAt",
        occurrence_count AS "occurrenceCount",
        status,
        COALESCE(array_agg(DISTINCT underlying_ticker) FILTER (WHERE underlying_ticker IS NOT NULL), '{}') AS "underlyingTickers"
      FROM journal_entries_with_underlying
      ${where}
      GROUP BY id, timestamp, object_type, object_id, object_title, action_type, action_description,
               triage_record_id, skill_invoked, previous_state, new_state, rationale, source, metadata,
               batch_id, first_detected_at, last_seen_at, occurrence_count, status
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(DISTINCT id) as total
      FROM journal_entries_with_underlying
      ${where}
    `);

    return NextResponse.json({
      entries: entriesResult,
      total: Number((countResult as unknown as { total: string }[])[0]?.total ?? 0),
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch journal entries',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Get distinct values for filters
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { field } = body;

    if (field === 'objectTypes') {
      const result = await db
        .selectDistinct({ value: journalEntries.objectType })
        .from(journalEntries)
        .orderBy(journalEntries.objectType);
      return NextResponse.json({ values: result.map((r) => r.value) });
    }

    if (field === 'actionTypes') {
      const result = await db
        .selectDistinct({ value: journalEntries.actionType })
        .from(journalEntries)
        .orderBy(journalEntries.actionType);
      return NextResponse.json({ values: result.map((r) => r.value) });
    }

    if (field === 'sources') {
      const result = await db
        .selectDistinct({ value: journalEntries.source })
        .from(journalEntries)
        .orderBy(journalEntries.source);
      return NextResponse.json({ values: result.map((r) => r.value) });
    }

    return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching filter values:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch filter values',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
