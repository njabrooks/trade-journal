import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { db } from '@/db';
import { trades } from '@/db/schema';
import { normalizeFlexTradeRow, validateFlexTradeRow, FlexTradeRow } from '@/lib/ingestion/flex/trades';
import { resolveAccountId } from '@/lib/ingestion/flex/account';
import { eq } from 'drizzle-orm';

const SECTION_CODES = {
  TRADES: 'TRNT',
  EXERCISES: 'OPTT',
  CASH: 'CTRN',
};

function buildRecord(fieldNames: string[], row: string[]): FlexTradeRow {
  const record: FlexTradeRow = {};
  fieldNames.forEach((field, idx) => {
    const key = field?.trim();
    if (!key) return;
    const value = row[idx + 2];
    if (value !== undefined) {
      record[key] = value.trim();
    }
  });
  return record;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const csvText = await file.text();
    const parsed = Papa.parse<string[]>(csvText, {
      header: false,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { error: 'CSV parsing errors', details: parsed.errors },
        { status: 400 }
      );
    }

    const rows = parsed.data;
    const trntHeader = rows.find(
      (row) => row[0] === 'HEADER' && row[1] === SECTION_CODES.TRADES
    );

    if (!trntHeader) {
      return NextResponse.json(
        { error: 'TRNT header not found in file' },
        { status: 400 }
      );
    }

    const fieldNames = trntHeader.slice(2);
    const trntDataRows = rows.filter(
      (row) => row[0] === 'DATA' && row[1] === SECTION_CODES.TRADES
    );
    const opttRows = rows.filter(
      (row) => row[0] === 'DATA' && row[1] === SECTION_CODES.EXERCISES
    );
    const ctrnRows = rows.filter(
      (row) => row[0] === 'DATA' && row[1] === SECTION_CODES.CASH
    );

    const accountCache = new Map<string, string>();

    let inserted = 0;
    let skipped = 0;
    let validationErrors = 0;
    let normalizationErrors = 0;
    let insertErrors = 0;

    for (let i = 0; i < trntDataRows.length; i++) {
      const dataRow = trntDataRows[i];
      const record = buildRecord(fieldNames, dataRow);

      const validation = validateFlexTradeRow(record);
      if (!validation.valid) {
        validationErrors++;
        continue;
      }

      const clientAccountId =
        record['ClientAccountID'] ||
        record['Client Account ID'] ||
        record['clientAccountID'];

      if (!clientAccountId) {
        validationErrors++;
        continue;
      }

      let accountId: string;
      try {
        accountId = await resolveAccountId(clientAccountId, 'IBKR', accountCache);
      } catch (error) {
        validationErrors++;
        continue;
      }

      let normalized;
      try {
        normalized = normalizeFlexTradeRow(record, accountId);
      } catch (error) {
        normalizationErrors++;
        continue;
      }

      try {
        if (normalized.brokerTransactionId) {
          const existing = await db
            .select({ id: trades.id })
            .from(trades)
            .where(eq(trades.brokerTransactionId, normalized.brokerTransactionId))
            .limit(1);

          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }

        await db
          .insert(trades)
          .values(normalized)
          .onConflictDoNothing({ target: trades.brokerTransactionId });
        inserted++;
      } catch (error) {
        insertErrors++;
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        trntRows: trntDataRows.length,
        opttRows: opttRows.length,
        ctrnRows: ctrnRows.length,
        inserted,
        skipped,
        validationErrors,
        normalizationErrors,
        insertErrors,
      },
    });
  } catch (error) {
    console.error('Flex trades ingestion error:', error);
    return NextResponse.json(
      {
        error: 'Ingestion failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

