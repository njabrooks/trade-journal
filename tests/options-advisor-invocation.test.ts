import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = process.cwd();
const invocation = resolve(root, 'scripts/cron/options-advisor-invocation.sh');
const dirs: string[] = [];
function invoke(mode: string, runMode: string, marker?: string, extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'options-advisor-invocation-')); dirs.push(dir);
  const fake = join(dir, 'claude'); writeFileSync(fake, '#!/bin/sh\nprintf \'%s\\n\' "$@"\n'); chmodSync(fake, 0o755);
  const date = join(dir, 'date'); writeFileSync(date, '#!/bin/sh\ncase "$*" in *%u*) echo 5;; *) echo 1000;; esac\n'); chmodSync(date, 0o755);
  const nc = join(dir, 'nc'); writeFileSync(nc, '#!/bin/sh\nexit 0\n'); chmodSync(nc, 0o755);
  const leapEngine = join(dir, 'leap-engine'); writeFileSync(leapEngine, '#!/bin/sh\nprintf \'{"scenario":"leap_entry","candidates":[],"skipped":[]}\\n\'\n'); chmodSync(leapEngine, 0o755);
  return spawnSync('/bin/bash', [invocation, mode, runMode], { cwd: root, encoding: 'utf8', env: { ...process.env, TJ_OPTIONS_ADVISOR_CLAUDE_BIN: fake, TJ_OPTIONS_ADVISOR_DATE_BIN: date, TJ_OPTIONS_ADVISOR_NC_BIN: nc, TJ_OPTIONS_ADVISOR_LEAP_ENGINE_BIN: leapEngine, TJ_OPTIONS_ADVISOR_ROLLBACK_MARKER: marker ?? join(dir, 'marker'), ...extraEnv } });
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('options advisor provider selector', () => {
  it('governs the batch path with all six scenarios and no-trade refusal', () => {
    const result = invoke('batch', 'live');
    expect(result.stdout).toContain('capabilities/portfolio-options-advice/adapters/claude.md');
    expect(result.stdout).toContain('"mode":"morning-batch"');
    expect(result.stdout).toContain('"maxRecommendations":5');
    expect(result.stdout).toContain('Never call an order, trade, execution, preview, staging');
  });
  it('bounds shadow and canary while preserving empty-result behavior', () => {
    const shadow = invoke('batch', 'shadow'); const canary = invoke('batch', 'canary');
    expect(shadow.stdout).toContain('READ-ONLY SHADOW'); expect(shadow.stdout).toContain('"maxRecommendations":1');
    expect(canary.stdout).toContain('"scenarioFilters":["opportunistic"]'); expect(canary.stdout).toContain('if none survives, write nothing');
  });
  it('governs LEAP in eligible hours with gateway, persistence, liquidity, and no-trade gates', () => {
    const result = invoke('leap', 'live');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"mode":"leap"');
    expect(result.stdout).toContain('"scenarioFilters":["leap_entry"]');
    expect(result.stdout).toContain('"candidateInputPath":"');
    expect(result.stdout).toContain('"candidateUniverseMaxTickers":10');
    expect(result.stdout).toContain('already ran the canonical LEAP engine synchronously');
    expect(result.stdout).toContain('persistence, existing-expression, liquidity, and live/delayed quote verification');
    expect(result.stdout).toContain('Never call an order, trade, execution, preview, staging');
  });
  it('bounds LEAP shadow and canary and preserves empty results', () => {
    const shadow = invoke('leap', 'shadow'); const canary = invoke('leap', 'canary');
    expect(shadow.status).toBe(0); expect(canary.status).toBe(0);
    expect(shadow.stdout).toContain('READ-ONLY SHADOW'); expect(shadow.stdout).toContain('genuine-candidate and no-candidate');
    expect(shadow.stdout).toContain('"candidateUniverseMaxTickers":2');
    expect(canary.stdout).toContain('"candidateUniverseMaxTickers":1');
    expect(canary.stdout).toContain('"maxRecommendations":1'); expect(canary.stdout).toContain('if none survives, write nothing');
  });
  it('refuses LEAP before provider invocation when the gateway is unavailable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'options-advisor-gateway-')); dirs.push(dir); const nc = join(dir, 'nc'); writeFileSync(nc, '#!/bin/sh\nexit 1\n'); chmodSync(nc, 0o755);
    const result = invoke('leap', 'live', undefined, { TJ_OPTIONS_ADVISOR_NC_BIN: nc });
    expect(result.stderr).toContain('Gateway is unavailable'); expect(result.stdout).toBe(''); expect(result.status).toBe(0);
  });
  it('refuses LEAP outside eligible market hours without writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'options-advisor-hours-')); dirs.push(dir); const date = join(dir, 'date'); writeFileSync(date, '#!/bin/sh\ncase "$*" in *%u*) echo 5;; *) echo 0800;; esac\n'); chmodSync(date, 0o755);
    const result = invoke('leap', 'live', undefined, { TJ_OPTIONS_ADVISOR_DATE_BIN: date });
    expect(result.stderr).toContain('market hours are not eligible'); expect(result.stdout).toBe(''); expect(result.status).toBe(0);
  });
  it('restores legacy batch and preserves wrapper controls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'options-advisor-rollback-')); dirs.push(dir); const marker = join(dir, 'legacy'); writeFileSync(marker, 'x');
    expect(invoke('batch', 'live', marker).stdout).toContain('/options-advisor Scheduled morning batch run.');
    const shell = readFileSync(resolve(root, 'scripts/cron/options-advisor-run.sh'), 'utf8');
    expect(shell).toContain('CLAUDE_TIMEOUT=2400'); expect(shell).toContain('CLAUDE_TIMEOUT=3600');
    expect(shell).toContain('CLAUDE_TIMEOUT + 600'); expect(shell).toContain('os.killpg'); expect(shell.trimEnd()).toMatch(/exit 0$/);
  });
  it('restores the exact legacy LEAP invocation with a mode-specific marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'options-advisor-leap-rollback-')); dirs.push(dir); const marker = join(dir, 'legacy'); writeFileSync(marker, 'x');
    const result = invoke('leap', 'live', marker);
    expect(result.stdout).toContain('-p\n/options-advisor Scheduled leap_entry run.');
    expect(result.stdout).not.toContain('--json-schema');
  });
});
