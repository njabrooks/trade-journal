import { NextResponse } from 'next/server';
import { db } from '@/db';
import { morningBriefs } from '@/db/schema';
import { desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Latest morning brief (docs/v2/20 Lane A) — the dashboard MorningBrief module's
 * data surface. One row per day (upsert on brief_date); we serve the newest.
 */
export async function GET() {
  try {
    const [brief] = await db
      .select()
      .from(morningBriefs)
      .orderBy(desc(morningBriefs.briefDate))
      .limit(1);

    return NextResponse.json({ brief: brief ?? null });
  } catch (error) {
    console.error('Failed to fetch morning brief:', error);
    return NextResponse.json({ error: 'Failed to fetch morning brief' }, { status: 500 });
  }
}
