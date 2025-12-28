import { NextResponse } from 'next/server';
import { db } from '@/db';
import { mainClaims } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const claims = await db
      .select({
        id: mainClaims.id,
        title: mainClaims.title,
        category: mainClaims.category,
        claim: mainClaims.claim,
        qualifier: mainClaims.qualifier,
        timeHorizon: mainClaims.timeHorizon,
        relevantTickers: mainClaims.relevantTickers,
        status: mainClaims.status,
        createdAt: mainClaims.createdAt,
      })
      .from(mainClaims)
      .orderBy(desc(mainClaims.createdAt));

    return NextResponse.json({ claims });
  } catch (error) {
    console.error('Error fetching main claims:', error);
    return NextResponse.json(
      { error: 'Failed to fetch main claims' },
      { status: 500 }
    );
  }
}
