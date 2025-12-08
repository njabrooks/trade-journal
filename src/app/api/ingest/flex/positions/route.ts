import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { db } from '@/db';
import { positions } from '@/db/schema';
import type { NewPosition } from '@/db/schema';
import {
  FlexPositionRow,
  normalizeFlexPositionRow,
  validateFlexPositionRow,
} from '@/lib/ingestion/flex/positions';
import { resolveAccountId } from '@/lib/ingestion/flex/account';
import { and, eq } from 'drizzle-orm';
import { computeTriageForDate } from '@/lib/derived/triage';
import { computeStrategyMetricsForDateRange } from '@/lib/derived/strategyMetrics';
import { computePortfolioSnapshotsForDateRange } from '@/lib/derived/portfolio';
import { autoLinkPositionsToStrategies } from '@/lib/derived/strategyAuto';
import { strategies } from '@/db/schema';

const SECTION_CODE = 'POST';

type ErrorDetail = {
  row: number;
  errors: string[];
};

type RecordWithMeta = {
  record: FlexPositionRow;
  rowNumber: number;
};

function buildRecord(fieldNames: string[], row: string[]): FlexPositionRow {
  const record: FlexPositionRow = {};
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

function extractClientAccountId(row: FlexPositionRow): string | undefined {
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
        { error: 'POST header not found in file' },
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
        { error: 'ClientAccountID missing in first POST row' },
        { status: 400 }
      );
    }

    const accountId = await resolveAccountId(firstAccountValue);

    const validationErrors: ErrorDetail[] = [];
    const normalizationErrors: ErrorDetail[] = [];
    const insertErrors: ErrorDetail[] = [];

    const normalizedRows: Array<{ data: Omit<NewPosition, 'id' | 'createdAt' | 'updatedAt'>; rowNumber: number }> = [];
    const snapshotKeys = new Set<string>();

    for (const { record, rowNumber } of dataRows) {
      const validation = validateFlexPositionRow(record);
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
        const normalized = await normalizeFlexPositionRow(record, accountId);
        if (!normalized.snapshotDate) {
          normalizationErrors.push({ row: rowNumber, errors: ['Snapshot date missing'] });
          continue;
        }
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
        .delete(positions)
        .where(and(eq(positions.accountId, acc), eq(positions.snapshotDate, snapshotDate)));
      deletedSnapshots++;
    }

    let inserted = 0;
    for (const entry of normalizedRows) {
      try {
        await db.insert(positions).values(entry.data);
        inserted++;
      } catch (error) {
        insertErrors.push({
          row: entry.rowNumber,
          errors: [error instanceof Error ? error.message : 'Insert failed'],
        });
      }
    }

    // Auto-trigger recompute for all affected snapshot dates
    const recomputeResults: any = {};
    const uniqueSnapshotDates = Array.from(snapshotKeys)
      .map((key) => {
        const parts = key.split('::');
        return parts.length === 2 ? parts[1] : null;
      })
      .filter(Boolean) as string[];
    
    if (uniqueSnapshotDates.length > 0 && inserted > 0) {
      // Get unique snapshot dates
      const snapshotDates = Array.from(new Set(uniqueSnapshotDates));
      
      for (const snapshotDate of snapshotDates) {
        if (!snapshotDate) continue;
        
        try {
          // Auto-link positions to strategies (creates strategies if needed)
          const autoLinkResult = await autoLinkPositionsToStrategies(accountId, { snapshotDate });
          
          // Portfolio snapshots
          await computePortfolioSnapshotsForDateRange(
            accountId,
            snapshotDate,
            snapshotDate,
            false, // includeUnderlyings
            false // onlyLatestForUnderlyings
          );
          
          // Strategy metrics (for all strategies in account, including newly created ones)
          const accountStrategies = await db
            .select({ id: strategies.id })
            .from(strategies)
            .where(eq(strategies.accountId, accountId));
          
          let strategyMetricsCount = 0;
          for (const strategy of accountStrategies) {
            const count = await computeStrategyMetricsForDateRange(
              accountId,
              strategy.id,
              snapshotDate,
              snapshotDate
            );
            strategyMetricsCount += count;
          }
          
          // Triage
          await computeTriageForDate(snapshotDate, accountId);
          
          recomputeResults[snapshotDate] = {
            autoStrategies: {
              strategiesCreated: autoLinkResult.strategiesCreated,
              positionsLinked: autoLinkResult.positionsLinked,
            },
            strategyMetrics: strategyMetricsCount,
            success: true,
          };
          
        } catch (error) {
          console.error(`Failed to auto-recompute after positions ingestion for ${snapshotDate}:`, error);
          recomputeResults[snapshotDate] = {
            error: error instanceof Error ? error.message : 'Recompute failed',
          };
        }
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
      autoRecompute: Object.keys(recomputeResults).length > 0 ? recomputeResults : undefined,
    });
  } catch (error) {
    console.error('Flex positions ingestion error:', error);
    return NextResponse.json(
      {
        error: 'Ingestion failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
