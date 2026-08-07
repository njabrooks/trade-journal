import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistGovernedOutcome } from '../scripts/ops/prove-options-advisor-persistence.js';
import type { AdvisorRecommendationStore } from '../scripts/ops/save-advisor-recommendations.js';

const root = process.cwd();
const invocation = resolve(root, 'scripts/cron/options-advisor-invocation.sh');
const fixture = resolve(
  root,
  'tests/fixtures/options-advisor/genuine-opportunistic-recommendation.json',
);
const proofScript = resolve(root, 'scripts/ops/prove-options-advisor-persistence.ts');
const fixtureData = JSON.parse(readFileSync(fixture, 'utf8'));
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('morning options-advisor governed persistence proof', () => {
  it('runs verified fixture persistence through the real wrapper boundary', () => {
    const directory = mkdtempSync(join(tmpdir(), 'advisor-fixture-provider-'));
    directories.push(directory);
    const provider = join(directory, 'claude');
    writeFileSync(
      provider,
      `#!/bin/sh\nexec "${process.execPath}" --import tsx "${proofScript}" --provider-fixture "${fixture}" "$@"\n`,
    );
    chmodSync(provider, 0o755);

    const result = spawnSync('/bin/bash', [invocation, 'batch', 'canary'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        TJ_OPTIONS_ADVISOR_CLAUDE_BIN: provider,
        TJ_OPTIONS_ADVISOR_SKIP_ENV: '1',
      },
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const proof = JSON.parse(result.stdout);
    expect(proof.request).toEqual({
      mode: 'morning-batch',
      scenarioFilters: ['opportunistic'],
      maxRecommendations: 1,
    });
    expect(proof.persisted.map((row: { ticker: string }) => row.ticker)).toEqual(['SLV']);
    expect(proof.writes).toEqual([
      expect.objectContaining({ inserted: 1, superseded: 2 }),
    ]);
    expect(proof.effects).toEqual([
      'resolve-underlyings:SLV',
      'supersede:opportunistic',
      'insert:opportunistic:1',
    ]);
    expect(proof.noWriteOutcomes).toEqual([
      { name: 'empty candidates', writes: [], effects: [] },
      { name: 'unavailable verification', writes: [], effects: [] },
    ]);
  });

  it('does not persist a recommendation verified for another ticker', async () => {
    const store: AdvisorRecommendationStore = {
      resolveUnderlyingIds: vi.fn(),
      supersedeActive: vi.fn(),
      insertRecommendations: vi.fn(),
    };
    const slv = fixtureData.governedRecommendations[0];
    const gldVerification = fixtureData.verification[1];

    const writes = await persistGovernedOutcome({
      request: fixtureData.request,
      verification: [gldVerification],
      governedRecommendations: [{ ...slv, verificationId: gldVerification.id }],
    }, store);

    expect(writes).toEqual([]);
    expect(store.resolveUnderlyingIds).not.toHaveBeenCalled();
    expect(store.supersedeActive).not.toHaveBeenCalled();
    expect(store.insertRecommendations).not.toHaveBeenCalled();
  });

  it('does not persist a spread unless every selected contract is verified', async () => {
    const store: AdvisorRecommendationStore = {
      resolveUnderlyingIds: vi.fn(),
      supersedeActive: vi.fn(),
      insertRecommendations: vi.fn(),
    };
    const slv = fixtureData.governedRecommendations[0];
    const spread = {
      ...slv,
      recommendation: {
        ...slv.recommendation,
        structure: {
          ...slv.recommendation.structure,
          legs: [
            ...slv.recommendation.structure.legs,
            {
              action: 'SELL',
              expiry: '2026-12-18',
              strike: 50,
              right: 'C',
              mid: 0.8,
            },
          ],
        },
      },
    };

    const writes = await persistGovernedOutcome({
      request: fixtureData.request,
      verification: [fixtureData.verification[0]],
      governedRecommendations: [spread],
    }, store);

    expect(writes).toEqual([]);
    expect(store.resolveUnderlyingIds).not.toHaveBeenCalled();
    expect(store.supersedeActive).not.toHaveBeenCalled();
    expect(store.insertRecommendations).not.toHaveBeenCalled();
  });

  it('refuses scenarios outside the accepted morning six', async () => {
    const store: AdvisorRecommendationStore = {
      resolveUnderlyingIds: vi.fn(),
      supersedeActive: vi.fn(),
      insertRecommendations: vi.fn(),
    };

    await expect(persistGovernedOutcome({
      request: {
        mode: 'morning-batch',
        scenarioFilters: ['leap_entry'],
        maxRecommendations: 1,
      },
      verification: fixtureData.verification,
      governedRecommendations: [{
        ...fixtureData.governedRecommendations[0],
        scenario: 'leap_entry',
      }],
    }, store)).rejects.toThrow('scenario outside the accepted six');
    expect(store.insertRecommendations).not.toHaveBeenCalled();
  });
});
