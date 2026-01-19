import { NextResponse } from 'next/server';
import { getAllMainClaimsWithSources } from '@/db/queries/research';

export async function GET() {
  try {
    const claimsWithSources = await getAllMainClaimsWithSources();
    return NextResponse.json(claimsWithSources);
  } catch (error) {
    console.error('Failed to fetch claims with sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch claims' },
      { status: 500 }
    );
  }
}
