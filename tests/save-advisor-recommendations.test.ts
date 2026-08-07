import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

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

describe('approved advisor recommendation writer', () => {
  it('persists a fixture-backed verified recommendation with the dashboard result contract', async () => {
    const insertedRows: Array<Record<string, unknown>> = [];
    const effects: string[] = [];
    const store: AdvisorRecommendationStore = {
      resolveUnderlyingIds: vi.fn(async () => {
        effects.push('resolve-underlyings');
        return new Map([['SLV', 'slv-underlying']]);
      }),
      supersedeActive: vi.fn(async (scenario) => {
        effects.push(`supersede:${scenario}`);
        return 2;
      }),
      insertRecommendations: vi.fn(async (rows) => {
        effects.push(`insert:${rows.length}`);
        insertedRows.push(...rows);
        return rows.length;
      }),
    };
    const now = new Date('2026-08-07T08:05:00.000Z');

    expect(fixture.request).toEqual({
      mode: 'morning-batch',
      scenarioFilters: ['opportunistic'],
      maxRecommendations: 1,
    });
    expect(fixture.verification).toContainEqual(
      expect.objectContaining({
        ticker: 'SLV',
        status: 'verified',
        legs: [expect.objectContaining({ bid: 2.1, ask: 2.3, mid: 2.2 })],
      }),
    );

    const result = await saveAdvisorRecommendations(fixtureBatch, {
      store,
      now,
      batchId: 'fixture-batch-id',
    });

    expect(store.resolveUnderlyingIds).toHaveBeenCalledWith(['SLV']);
    expect(store.supersedeActive).toHaveBeenCalledWith('opportunistic', now);
    expect(insertedRows).toEqual([
      expect.objectContaining({
        batchId: 'fixture-batch-id',
        scenario: 'opportunistic',
        ticker: 'SLV',
        underlyingId: 'slv-underlying',
        exposureUsd: '125000',
        pctNav: '0.0125',
        structure: fixtureBatch.recommendations[0].structure,
        metrics: fixtureBatch.recommendations[0].metrics,
        volContext: fixtureBatch.recommendations[0].volContext,
        rationale: fixtureBatch.recommendations[0].rationale,
        source: 'skill',
        expiresAt: new Date('2026-08-14T08:05:00.000Z'),
      }),
    ]);
    expect(result).toEqual({
      batchId: 'fixture-batch-id',
      inserted: 1,
      superseded: 2,
      expiresAt: new Date('2026-08-14T08:05:00.000Z'),
    });
    expect(effects).toEqual([
      'resolve-underlyings',
      'supersede:opportunistic',
      'insert:1',
    ]);
  });

  for (const outcome of fixture.noWriteOutcomes) {
    it(`refuses ${outcome.name} without superseding or inserting`, async () => {
      const store: AdvisorRecommendationStore = {
        resolveUnderlyingIds: vi.fn(),
        supersedeActive: vi.fn(),
        insertRecommendations: vi.fn(),
      };

      if (outcome.unavailableInputs.length > 0) {
        expect(outcome.verification).toEqual([
          expect.objectContaining({ ticker: 'SLV', status: 'unavailable' }),
        ]);
      }
      await expect(saveAdvisorRecommendations({
        scenario: 'opportunistic',
        recommendations: [],
      }, { store })).rejects.toThrow(
        'Batch must have scenario and a non-empty recommendations array',
      );
      expect(store.resolveUnderlyingIds).not.toHaveBeenCalled();
      expect(store.supersedeActive).not.toHaveBeenCalled();
      expect(store.insertRecommendations).not.toHaveBeenCalled();
    });
  }
});
