import { NextResponse } from 'next/server';
import { db } from '@/db';
import { mainClaims } from '@/db/schema';
import { inArray } from 'drizzle-orm';

/**
 * POST /api/research/cleanup-duplicate-claims
 *
 * Delete duplicate main claims, keeping only the most recent version
 */
export async function POST() {
  try {
    const duplicatesToDelete = [
      // Duplicate PMI expansion claims (keeping 49a80e2c)
      '8604d61d-d2b6-485d-8fdd-974501f66a87',
      '95fd1499-47a1-4240-b548-bdd7beb06687',
      '4e3f79fe-977e-46fc-bad3-16edef4f1eca',
      // Duplicate Tesla robo-taxi claims (keeping 685dd0a3)
      '4e29306c-6bd5-4541-ad08-f47702c3eade',
      '0eebcdb4-5c6d-45cb-8e55-eb336acb806c',
    ];

    const deleted = await db
      .delete(mainClaims)
      .where(inArray(mainClaims.id, duplicatesToDelete))
      .returning();

    return NextResponse.json({
      success: true,
      deletedCount: deleted.length,
      deletedIds: deleted.map((c) => c.id),
      message: `Deleted ${deleted.length} duplicate claims`,
    });
  } catch (error: any) {
    console.error('Error cleaning up duplicates:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup duplicates', details: error.message },
      { status: 500 }
    );
  }
}
