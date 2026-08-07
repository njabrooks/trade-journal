import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = process.cwd();
const invocation = resolve(root, 'scripts/cron/options-advisor-invocation.sh');
const dirs: string[] = [];
function invoke(mode: string, runMode: string, marker?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'options-advisor-invocation-')); dirs.push(dir);
  const fake = join(dir, 'claude'); writeFileSync(fake, '#!/bin/sh\nprintf \'%s\\n\' "$@"\n'); chmodSync(fake, 0o755);
  return spawnSync('/bin/bash', [invocation, mode, runMode], { cwd: root, encoding: 'utf8', env: { ...process.env, TJ_OPTIONS_ADVISOR_CLAUDE_BIN: fake, TJ_OPTIONS_ADVISOR_ROLLBACK_MARKER: marker ?? join(dir, 'marker') } });
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
  it('leaves LEAP on the exact legacy path for #54', () => {
    const result = invoke('leap', 'live');
    expect(result.stdout).toContain('-p\n/options-advisor Scheduled leap_entry run.');
    expect(result.stdout).not.toContain('--json-schema');
  });
  it('restores legacy batch and preserves wrapper controls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'options-advisor-rollback-')); dirs.push(dir); const marker = join(dir, 'legacy'); writeFileSync(marker, 'x');
    expect(invoke('batch', 'live', marker).stdout).toContain('/options-advisor Scheduled morning batch run.');
    const shell = readFileSync(resolve(root, 'scripts/cron/options-advisor-run.sh'), 'utf8');
    expect(shell).toContain('CLAUDE_TIMEOUT=2400'); expect(shell).toContain('CLAUDE_TIMEOUT=3600');
    expect(shell).toContain('CLAUDE_TIMEOUT + 600'); expect(shell).toContain('os.killpg'); expect(shell.trimEnd()).toMatch(/exit 0$/);
  });
});
