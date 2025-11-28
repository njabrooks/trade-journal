import { NextRequest, NextResponse } from 'next/server';
import { getAllAccounts, upsertAccount } from '@/lib/ingestion/flex/account';

export async function GET() {
  try {
    const accounts = await getAllAccounts();
    return NextResponse.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch accounts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brokerAccountId, brokerName, baseCurrency, label } = body;

    if (!brokerAccountId) {
      return NextResponse.json(
        { error: 'brokerAccountId is required' },
        { status: 400 }
      );
    }

    const accountId = await upsertAccount({
      brokerAccountId,
      brokerName,
      baseCurrency,
      label,
    });

    return NextResponse.json({ id: accountId, success: true });
  } catch (error) {
    console.error('Error creating account:', error);
    return NextResponse.json(
      {
        error: 'Failed to create account',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

