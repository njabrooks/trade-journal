import { NextResponse } from 'next/server';
import { db } from '@/db';
import { macroTheses } from '@/db/schema';
import { inArray } from 'drizzle-orm';

/**
 * POST /api/research/cleanup-duplicate-theses
 *
 * Delete duplicate macro theses, keeping only the oldest version of each
 */
export async function POST() {
  try {
    // Duplicate "Bullish AI Supply Chains in 2026" - keep oldest (3b209e40)
    const duplicatesToDelete = [
      '0e67e7ec-6495-48ee-a4c7-3f57649acfdb',
      '1ce2c14c-a2e7-438e-a2b2-b8983b001dd0',
      '4e8c4e00-fd82-46cb-a5d7-e0505d88c91d',
      '1eefab78-b68e-4866-be37-7f75cef0ee26',
    ];

    const deleted = await db
      .delete(macroTheses)
      .where(inArray(macroTheses.id, duplicatesToDelete))
      .returning();

    return NextResponse.json({
      success: true,
      deletedCount: deleted.length,
      deletedIds: deleted.map((t) => t.id),
      message: `Deleted ${deleted.length} duplicate theses`,
    });
  } catch (error: any) {
    console.error('Error cleaning up duplicates:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup duplicates', details: error.message },
      { status: 500 }
    );
  }
}
