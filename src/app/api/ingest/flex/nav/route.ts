import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { db } from '@/db';
import { navSnapshots } from '@/db/schema';
import type { NewNavSnapshot } from '@/db/schema';
import {
  FlexNavRow,
  normalizeFlexNavRow,
  validateFlexNavRow,
} from '@/lib/ingestion/flex/nav';
import { resolveAccountId } from '@/lib/ingestion/flex/account';
import { and, eq } from 'drizzle-orm';

const SECTION_CODE = 'EQUT';

type ErrorDetail = {
  row: number;
  errors: string[];
};

type RecordWithMeta = {
  record: FlexNavRow;
  rowNumber: number;
};

function buildRecord(fieldNames: string[], row: string[]): FlexNavRow {
  const record: FlexNavRow = {};
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

function extractClientAccountId(row: FlexNavRow): string | undefined {
  return (
    row['ClientAccountID'] ||
    row['Client Account ID'] ||
    row['clientAccountID']
  );
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
        { error: 'EQUT header not found in file' },
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
        { error: 'ClientAccountID missing in first EQUT row' },
        { status: 400 }
      );
    }

    const accountId = await resolveAccountId(firstAccountValue);

    const validationErrors: ErrorDetail[] = [];
    const normalizationErrors: ErrorDetail[] = [];
    const insertErrors: ErrorDetail[] = [];

    const normalizedRows: Array<{ data: Omit<NewNavSnapshot, 'id' | 'createdAt'>; rowNumber: number }> = [];
    const snapshotKeys = new Set<string>();

    for (const { record, rowNumber } of dataRows) {
      const validation = validateFlexNavRow(record);
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
        const normalized = normalizeFlexNavRow(record, accountId);
        snapshotKeys.add(`${normalized.accountId}::${normalized.reportDate}`);
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
      const [acc, reportDate] = key.split('::');
      if (!reportDate) continue;
      await db
        .delete(navSnapshots)
        .where(and(eq(navSnapshots.accountId, acc), eq(navSnapshots.reportDate, reportDate)));
      deletedSnapshots++;
    }

    let inserted = 0;
    for (const entry of normalizedRows) {
      try {
        await db.insert(navSnapshots).values(entry.data);
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
        validationErrors: validationErrors.length,
        normalizationErrors: normalizationErrors.length,
        insertErrors: insertErrors.length,
      },
      validationErrors: validationErrors.length ? validationErrors : undefined,
      normalizationErrors: normalizationErrors.length ? normalizationErrors : undefined,
      insertErrors: insertErrors.length ? insertErrors : undefined,
    });
  } catch (error) {
    console.error('Flex NAV ingestion error:', error);
    return NextResponse.json(
      {
        error: 'Ingestion failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
