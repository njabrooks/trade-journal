import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluateMorningBriefInputs } from '../capabilities/morning-attention-brief/evaluate-inputs.js';
import { morningBriefs } from '../src/db/schema.js';

const harness = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  mutationTargets: [] as unknown[],
  conflictTargets: [] as unknown[],
}));

vi.mock('../src/db/index.js', () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        orderBy: () => query,
        limit: async () => [...harness.rows]
          .sort((a, b) => String(b.briefDate).localeCompare(String(a.briefDate)))
          .slice(0, 1),
      };
      return query;
    },
  },
}));

import { GET } from '../src/app/api/dashboard/morning-brief/route.js';
import { parseMorningBriefResponse } from '../src/components/portfolio/MorningBrief.js';
import {
  createDrizzleMorningBriefStore,
  saveMorningBrief,
  type PersistedBriefInput,
} from '../scripts/ops/save-morning-brief.js';

const root = process.cwd();
const invocation = resolve(root, 'scripts/cron/morning-brief-invocation.sh');
const evidenceRoot = resolve(root, 'capabilities/morning-attention-brief/evidence/scenarios');

function invokeFixture(name: string) {
  return spawnSync('/bin/bash', [invocation, 'fixture', name], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
}

const database = {
  insert(table: unknown) {
    harness.mutationTargets.push(table);
    return {
      values(input: PersistedBriefInput) {
        return {
          onConflictDoUpdate(config: { target: unknown; set: Record<string, unknown> }) {
            harness.conflictTargets.push(config.target);
            return {
              async returning() {
                const existing = harness.rows.find((row) => row.briefDate === input.briefDate);
                if (existing) {
                  Object.assign(existing, config.set);
                  return [existing];
                }
                const row = {
                  id: 'brief-fixture-id',
                  ...input,
                  createdAt: new Date('2026-08-07T08:45:00.000Z'),
                  updatedAt: new Date('2026-08-07T08:45:00.000Z'),
                };
                harness.rows.push(row);
                return [row as Record<string, unknown>];
              },
            };
          },
        };
      },
    };
  },
};

const store = createDrizzleMorningBriefStore(database, morningBriefs);

beforeEach(() => {
  harness.rows.length = 0;
  harness.mutationTargets.length = 0;
  harness.conflictTargets.length = 0;
});

describe('morning brief wrapper contract', () => {
  it.each([
    ['stale-required-inputs.json', 'stale'],
    ['missing-required-inputs.json', 'missing'],
  ])('preserves the governed refusal for %s without a write', (fixture, status) => {
    const result = invokeFixture(fixture);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const governed = JSON.parse(result.stdout) as ReturnType<typeof evaluateMorningBriefInputs>;
    const scenario = JSON.parse(
      readFileSync(resolve(evidenceRoot, fixture), 'utf8'),
    ) as unknown;
    expect(governed).toEqual(evaluateMorningBriefInputs(scenario));
    expect(Object.values(governed.freshness as Record<string, { status: string }>)
      .every((freshness) => freshness.status === status)).toBe(true);
    expect(governed.unavailableInputs).not.toEqual([]);
    expect(governed.errors).not.toEqual([]);
    expect(harness.mutationTargets).toEqual([]);
  });

  it('keeps one same-date row and exposes it through the dashboard consumer without shape drift', async () => {
    const first = await saveMorningBrief({
      briefDate: '2026-08-07',
      headline: 'Fresh governed morning brief',
      attention: [{ title: 'Review rates', why: 'Fresh evidence changed.', deepLink: '/thesis rates' }],
      bodyMd: '## Rates\nFresh evidence changed.',
      metadata: { generatedAt: '2026-08-07T07:45:00.000Z' },
    }, { store, now: new Date('2026-08-07T08:45:00.000Z') });
    const second = await saveMorningBrief({
      briefDate: '2026-08-07',
      headline: 'Fresh governed morning brief, updated',
      attention: [{ title: 'Review rates', why: 'The ranked action is unchanged.', deepLink: '/thesis rates' }],
      bodyMd: '## Rates\nThe ranked action is unchanged.',
      metadata: { generatedAt: '2026-08-07T08:50:00.000Z' },
    }, { store, now: new Date('2026-08-07T08:50:00.000Z') });

    expect(first).toMatchObject({ id: 'brief-fixture-id', superseded: false });
    expect(second).toMatchObject({ id: 'brief-fixture-id', superseded: true });
    expect(harness.rows).toHaveLength(1);
    expect(harness.mutationTargets).toEqual([morningBriefs, morningBriefs]);
    expect(harness.conflictTargets).toEqual([
      morningBriefs.briefDate,
      morningBriefs.briefDate,
    ]);

    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(parseMorningBriefResponse(payload)).toEqual({
      id: 'brief-fixture-id',
      briefDate: '2026-08-07',
      headline: 'Fresh governed morning brief, updated',
      attention: [{ title: 'Review rates', why: 'The ranked action is unchanged.', deepLink: '/thesis rates' }],
      bodyMd: '## Rates\nThe ranked action is unchanged.',
      updatedAt: '2026-08-07T08:50:00.000Z',
    });
  });
});
