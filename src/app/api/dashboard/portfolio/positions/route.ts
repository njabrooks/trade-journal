import { NextRequest, NextResponse } from 'next/server';
import { getPortfolioPositionsData } from '@/db/queries/portfolio';
import { getAccounts } from '@/db/queries/accounts';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const accountIdsParam = searchParams.get('accountIds');

    let accountIds: string[];

    if (accountIdsParam) {
      accountIds = accountIdsParam.split(',').filter(Boolean);
    } else {
      const allAccounts = await getAccounts();
      accountIds = allAccounts.map((a) => a.id);
    }

    const data = await getPortfolioPositionsData(accountIds);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching portfolio positions data:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch portfolio positions data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
