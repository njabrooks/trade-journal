import { NextRequest, NextResponse } from 'next/server';
import { getPortfolioDashboardDataMultiAccount } from '@/db/queries/portfolio';
import { getAccounts } from '@/db/queries/accounts';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const accountIdsParam = searchParams.get('accountIds');

    let accountIds: string[];

    if (accountIdsParam) {
      // Parse comma-separated account IDs
      accountIds = accountIdsParam.split(',').filter(Boolean);
    } else {
      // Default to all accounts
      const allAccounts = await getAccounts();
      accountIds = allAccounts.map((a) => a.id);
    }

    const data = await getPortfolioDashboardDataMultiAccount(accountIds);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching portfolio dashboard data:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch portfolio dashboard data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
