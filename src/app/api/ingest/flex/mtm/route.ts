import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { db } from '@/db';
import { mtmSnapshots } from '@/db/schema';
import type { NewMtmSnapshot } from '@/db/schema';
import {
  FlexMtmRow,
  normalizeFlexMtmRow,
  validateFlexMtmRow,
} from '@/lib/ingestion/flex/mtm';
import { resolveAccountId } from '@/lib/ingestion/flex/account';
import { and, eq } from 'drizzle-orm';

const SECTION_CODE = 'MTMP';
const SUMMARY_MARKERS = new Set(['summary', 'total', 'aggregate']);

type ErrorDetail = {
  row: number;
  errors: string[];
};

type RecordWithMeta = {
  record: FlexMtmRow;
  rowNumber: number;
};

function buildRecord(fieldNames: string[], row: string[]): FlexMtmRow {
  const record: FlexMtmRow = {};
  fieldNames.forEach((field, idx) => {
    if (!field) return;
    const value = row[idx + 2];
    if (value === undefined) return;
    const trimmed = value.trim();
    if (trimmed !== '') {
      record[field] = trimmed;
    }
  });
  return record;
}

function extractClientAccountId(row: FlexMtmRow): string | undefined {
  return (
    row['ClientAccountID'] ||
    row['Client Account ID'] ||
    row['clientAccountID']
  );
}

function isSummaryRow(row: FlexMtmRow): boolean {
  const conid =
    row['Conid'] ||
    row['conid'] ||
    row['CONID'] ||
    row['SecId'] ||
    row['secId'];
  if (conid && SUMMARY_MARKERS.has(conid.trim().toLowerCase())) {
    return true;
  }

  const levelOfDetail = row['LevelOfDetail'] || row['Level Of Detail'];
  if (levelOfDetail && SUMMARY_MARKERS.has(levelOfDetail.trim().toLowerCase())) {
    return true;
  }

  const symbol = row['Symbol'] || row['symbol'];
  if (!symbol) {
    const quantity = row['Quantity'] || row['quantity'];
    const markPrice = row['MarkPrice'] || row['markPrice'];
    const marketValue = row['MarketValue'] || row['marketValue'];
    if (!quantity && !markPrice && !marketValue) {
      return true;
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

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
    const headerRow = rows.find(
      (row) => row[0] === 'HEADER' && row[1] === SECTION_CODE
    );

    if (!headerRow) {
      return NextResponse.json(
        { error: 'MTMP header not found in file' },
        { status: 400 }
      );
    }

    const fieldNames = headerRow.slice(2);
    const dataRows: RecordWithMeta[] = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row[0] === 'DATA' && row[1] === SECTION_CODE)
      .map(({ row }, dataIdx) => ({
        record: buildRecord(fieldNames, row),
        rowNumber: dataIdx + 1,
      }));

    if (dataRows.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          totalRows: 0,
          validRows: 0,
          inserted: 0,
          deletedSnapshots: 0,
          validationErrors: 0,
          normalizationErrors: 0,
          insertErrors: 0,
        },
      });
    }

    const firstAccountValue = extractClientAccountId(dataRows[0].record);
    if (!firstAccountValue) {
      return NextResponse.json(
        { error: 'ClientAccountID missing in first MTMP row' },
        { status: 400 }
      );
    }

    const accountId = await resolveAccountId(firstAccountValue);

    const validationErrors: ErrorDetail[] = [];
    const normalizationErrors: ErrorDetail[] = [];
    const insertErrors: ErrorDetail[] = [];

    const normalizedRows: Array<{ data: Omit<NewMtmSnapshot, 'id' | 'createdAt'>; rowNumber: number }> = [];
    const snapshotKeys = new Set<string>();
    let summaryRowsSkipped = 0;

    for (const { record, rowNumber } of dataRows) {
      if (isSummaryRow(record)) {
        summaryRowsSkipped++;
        continue;
      }

      const validation = validateFlexMtmRow(record);
      if (!validation.valid) {
        validationErrors.push({ row: rowNumber, errors: validation.errors });
        continue;
      }

      const rowAccountId = extractClientAccountId(record);
      if (rowAccountId && rowAccountId !== firstAccountValue) {
        validationErrors.push({
          row: rowNumber,
          errors: ['Multiple ClientAccountID values in one upload are not supported'],
        });
        continue;
      }

      try {
        const normalized = normalizeFlexMtmRow(record, accountId);
        snapshotKeys.add(`${normalized.accountId}::${normalized.snapshotDate}`);
        normalizedRows.push({ data: normalized, rowNumber });
      } catch (error) {
        normalizationErrors.push({
          row: rowNumber,
          errors: [error instanceof Error ? error.message : 'Normalization failed'],
        });
      }
    }

    let deletedSnapshots = 0;
    for (const key of snapshotKeys) {
      const [acc, snapshotDate] = key.split('::');
      if (!snapshotDate) continue;
      await db
        .delete(mtmSnapshots)
        .where(and(eq(mtmSnapshots.accountId, acc), eq(mtmSnapshots.snapshotDate, snapshotDate)));
      deletedSnapshots++;
    }

    let inserted = 0;
    for (const entry of normalizedRows) {
      try {
        await db.insert(mtmSnapshots).values(entry.data);
        inserted++;
      } catch (error) {
        insertErrors.push({
          row: entry.rowNumber,
          errors: [error instanceof Error ? error.message : 'Insert failed'],
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalRows: dataRows.length,
        validRows: normalizedRows.length,
        inserted,
        deletedSnapshots,
        summaryRowsSkipped,
        validationErrors: validationErrors.length,
        normalizationErrors: normalizationErrors.length,
        insertErrors: insertErrors.length,
      },
      validationErrors: validationErrors.length ? validationErrors : undefined,
      normalizationErrors: normalizationErrors.length ? normalizationErrors : undefined,
      insertErrors: insertErrors.length ? insertErrors : undefined,
    });
  } catch (error) {
    console.error('Flex MTM ingestion error:', error);
    return NextResponse.json(
      {
        error: 'Ingestion failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
