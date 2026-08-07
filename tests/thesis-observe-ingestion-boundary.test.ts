import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  candidateCalls: 0,
  intelCalls: 0,
  journalEntries: [] as Array<Record<string, unknown>>,
  mutations: [] as Array<{ target: string; values: unknown }>,
}));

vi.mock('../scripts/lib/db.js', async () => {
  const schema = await import('../src/db/schema.js');
  const signalId = '11111111-1111-1111-1111-111111111111';
  const thesisId = '22222222-2222-2222-2222-222222222222';

  const db = {
    select: () => {
      let table: unknown;
      const query = {
        from: (selectedTable: unknown) => {
          table = selectedTable;
          return query;
        },
        innerJoin: () => query,
        where: async () => {
          if (table === schema.signals) {
            return [{
              id: signalId,
              type: 'confirmation',
              statement: 'Settlement adoption accelerates',
              thesisId,
              thesisType: 'macro',
            }];
          }
          if (table === schema.macroTheses) {
            return [{ id: thesisId, title: 'Bullish Tokenisation' }];
          }
          if (table === schema.assetTheses) return [];
          throw new Error('Unexpected read outside the signal-evidence boundary');
        },
      };
      return query;
    },
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        const target = table === schema.signalDataSnapshots
          ? 'signal_data_snapshots'
          : 'forbidden_insert';
        harness.mutations.push({ target, values });
      },
    }),
    update: (table: unknown) => {
      harness.mutations.push({ target: 'forbidden_update', values: table });
      throw new Error('Entity and Decision Item updates are forbidden');
    },
    delete: (table: unknown) => {
      harness.mutations.push({ target: 'forbidden_delete', values: table });
      throw new Error('Entity and Decision Item deletes are forbidden');
    },
  };

  return {
    db,
    closeDb: async () => {},
    logToJournal: async (entry: Record<string, unknown>) => {
      harness.journalEntries.push(entry);
      return '33333333-3333-3333-3333-333333333333';
    },
    schema,
  };
});

vi.mock('../src/lib/intelligence/emitIntelItems.js', () => ({
  emitIntelItems: async () => {
    harness.intelCalls++;
    return 2;
  },
}));

vi.mock('../src/lib/intelligence/candidateSignals.js', () => ({
  upsertCandidateSignal: async () => {
    harness.candidateCalls++;
    return 'written';
  },
}));

import { ingestReport } from '../scripts/ingest-world-monitor.js';

const directory = mkdtempSync(join(tmpdir(), 'thesis-observe-ingestion-'));
const observeReport = join(directory, 'thesis-observe.md');
const worldReport = join(directory, 'world-monitor.md');

writeFileSync(observeReport, `---
date: 2026-08-07T07:00:00Z
type: thesis-observe
version: 1
---
# Thesis Observe

## THESIS-RELEVANT NEWS

- 🟡 **Coverage hole reaches the thesis** — Thesis: Bullish Tokenisation
  The report contains news not covered by an existing signal. ([Source](https://example.com/news))

## SIGNAL ASSESSMENT

### Bullish Tokenisation (macro — bullish)

#### 🟢 Settlement adoption accelerates
- **Signal ID:** 11111111-1111-1111-1111-111111111111
- **Score:** strengthening
- **Evidence:** A current primary source confirms adoption.
`);

writeFileSync(worldReport, `---
date: 2026-08-07T07:00:00Z
type: world-monitor
version: 1
---
# World Monitor

## EXECUTIVE SUMMARY

- 🟡 **MEDIUM: Market structure update** — A current-source update.
`);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

beforeEach(() => {
  harness.candidateCalls = 0;
  harness.intelCalls = 0;
  harness.journalEntries.length = 0;
  harness.mutations.length = 0;
});

describe('thesis-observe governed ingestion boundary', () => {
  it('writes only signal evidence and its audit history in thesis-observe-only mode', async () => {
    const result = await ingestReport(observeReport, { thesisObserveOnly: true });

    expect(harness.intelCalls).toBe(0);
    expect(harness.candidateCalls).toBe(0);
    expect(harness.mutations).toHaveLength(1);
    expect(harness.mutations[0]).toMatchObject({ target: 'signal_data_snapshots' });
    expect(harness.mutations[0].values).toEqual([
      expect.objectContaining({
        signalId: '11111111-1111-1111-1111-111111111111',
        assessment: 'strengthening',
        evidenceSummary: 'A current primary source confirms adoption.',
        dataSource: 'thesis_observe',
        status: 'pending',
      }),
    ]);
    expect(harness.journalEntries).toEqual([
      expect.objectContaining({
        objectType: 'macro_thesis',
        objectId: '22222222-2222-2222-2222-222222222222',
        actionType: 'signal_evidence_received',
        source: 'automation',
      }),
    ]);
    expect(result).toMatchObject({
      emitted: 0,
      skipped: false,
      candidates: { written: 0, bumped: 0, skipped: 0 },
    });
  });

  it('retains intel-item and candidate-signal writes on the legacy path', async () => {
    const result = await ingestReport(observeReport);

    expect(harness.intelCalls).toBe(1);
    expect(harness.candidateCalls).toBe(1);
    expect(harness.mutations.map(({ target }) => target)).toEqual(['signal_data_snapshots']);
    expect(harness.journalEntries.map(({ actionType }) => actionType)).toEqual([
      'signal_evidence_received',
    ]);
    expect(result.candidates.written).toBe(1);
  });

  it('refuses thesis-observe-only mode for any other report type before writes', async () => {
    await expect(
      ingestReport(worldReport, { thesisObserveOnly: true }),
    ).rejects.toThrow('--thesis-observe-only requires a report with type: thesis-observe');
    expect(harness.intelCalls).toBe(0);
    expect(harness.candidateCalls).toBe(0);
    expect(harness.mutations).toEqual([]);
    expect(harness.journalEntries).toEqual([]);
  });
});
