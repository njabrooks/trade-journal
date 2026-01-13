import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { journalEntries } from '@/db/schema';
import { desc, eq, ilike, and, or, SQL, gte, lte } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const objectType = searchParams.get('objectType');
    const actionType = searchParams.get('actionType');
    const source = searchParams.get('source');
    const search = searchParams.get('search');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build filter conditions
    const conditions: SQL<unknown>[] = [];

    if (objectType) {
      conditions.push(eq(journalEntries.objectType, objectType));
    }

    if (actionType) {
      conditions.push(eq(journalEntries.actionType, actionType));
    }

    if (source) {
      conditions.push(eq(journalEntries.source, source));
    }

    if (search) {
      conditions.push(
        or(
          ilike(journalEntries.objectTitle, `%${search}%`),
          ilike(journalEntries.actionDescription, `%${search}%`),
          ilike(journalEntries.rationale, `%${search}%`)
        )!
      );
    }

    if (startDate) {
      conditions.push(gte(journalEntries.timestamp, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(journalEntries.timestamp, new Date(endDate)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const entries = await db
      .select()
      .from(journalEntries)
      .where(whereClause)
      .orderBy(desc(journalEntries.timestamp))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const countResult = await db
      .select({ count: journalEntries.id })
      .from(journalEntries)
      .where(whereClause);

    return NextResponse.json({
      entries,
      total: countResult.length,
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
