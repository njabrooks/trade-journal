import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  selectCalls: 0,
}));

vi.mock('../src/db/index.js', () => ({
  db: {
    select: () => {
      const call = harness.selectCalls++;
      const query = {
        from: () => query,
        where: () => call === 0 ? query : Promise.resolve([]),
        orderBy: async () => harness.rows.map((row) => ({
          ...row,
          exposureUsd: row.exposureUsd == null ? null : Number(row.exposureUsd),
          pctNav: row.pctNav == null ? null : Number(row.pctNav),
        })),
      };
      return query;
    },
  },
}));

import { GET } from '../src/app/api/advisor/recommendations/route.js';
import { describeStructure } from '../src/components/portfolio/ScannerSnapshot.js';
import {
  saveAdvisorRecommendations,
  type AdvisorRecommendationStore,
} from '../scripts/ops/save-advisor-recommendations.js';

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'tests/fixtures/options-advisor/genuine-opportunistic-recommendation.json'),
    'utf8',
  ),
);
const fixtureBatch = {
  scenario: fixture.governedRecommendations[0].scenario,
  recommendations: [fixture.governedRecommendations[0].recommendation],
};

describe('advisor writer to ScannerSnapshot contract', () => {
  beforeEach(() => {
    harness.rows.length = 0;
    harness.selectCalls = 0;
  });

  it('serializes a persisted recommendation into the fields the dashboard presents', async () => {
    const store: AdvisorRecommendationStore = {
      resolveUnderlyingIds: async () => new Map([['SLV', 'slv-underlying']]),
      supersedeActive: async () => 0,
      insertRecommendations: async (rows) => {
        harness.rows.push(...rows.map((row) => ({
          ...row,
          id: 'fixture-row-id',
          createdAt: new Date('2026-08-07T08:05:00.000Z'),
        })));
        return rows.length;
      },
    };
    await saveAdvisorRecommendations(fixtureBatch, {
      store,
      now: new Date('2026-08-07T08:05:00.000Z'),
      batchId: 'fixture-batch-id',
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recommendations).toEqual([
      expect.objectContaining({
        id: 'fixture-row-id',
        scenario: 'opportunistic',
        ticker: 'SLV',
        exposureUsd: 125000,
        pctNav: 0.0125,
        structure: fixtureBatch.recommendations[0].structure,
        metrics: fixtureBatch.recommendations[0].metrics,
        volContext: fixtureBatch.recommendations[0].volContext,
        rationale: fixtureBatch.recommendations[0].rationale,
      }),
    ]);
    expect(describeStructure(body.recommendations[0])).toContain('42 long_call');
    expect(describeStructure(body.recommendations[0])).toContain('5.2%');
  });
});
