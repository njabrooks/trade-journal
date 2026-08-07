import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = process.cwd();
const invocation = resolve(root, 'scripts/cron/morning-brief-invocation.sh');
const dirs: string[] = [];

function invoke(runMode: string, marker?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'morning-brief-invocation-')); dirs.push(dir);
  const fake = join(dir, 'claude'); writeFileSync(fake, '#!/bin/sh\nprintf \'%s\\n\' "$@"\n'); chmodSync(fake, 0o755);
  const date = join(dir, 'date'); writeFileSync(date, '#!/bin/sh\necho 2026-08-07\n'); chmodSync(date, 0o755);
  return spawnSync('/bin/bash', [invocation, runMode], { cwd: root, encoding: 'utf8', env: { ...process.env, TJ_MORNING_BRIEF_CLAUDE_BIN: fake, TJ_MORNING_BRIEF_DATE_BIN: date, TJ_MORNING_BRIEF_ROLLBACK_MARKER: marker ?? join(dir, 'marker') } });
}

afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('morning brief provider selector', () => {
  it('governs live synthesis with exactly one upsert and belief-write refusals', () => {
    const result = invoke('live');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('capabilities/morning-attention-brief/adapters/claude.md');
    expect(result.stdout).toContain('"briefDate":"2026-08-07","dryRun":false');
    expect(result.stdout).toContain('exactly once');
    expect(result.stdout).toContain('Never write journal_entries');
    expect(result.stdout).toContain('"freshness":{"type":"object"');
    expect(result.stdout).toContain('"write":{"anyOf"');
  });
  it('keeps shadow read-only and canary bounded to the sole upsert', () => {
    const shadow = invoke('shadow'); const canary = invoke('canary');
    expect(shadow.stdout).toContain('"dryRun":true'); expect(shadow.stdout).toContain('persisted must be false');
    expect(canary.stdout).toContain('CANARY: perform exactly one same-date morning_briefs upsert');
    expect(canary.stdout).toContain('at most five attention items');
  });
  it('restores the exact legacy invocation with a marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'morning-brief-rollback-')); dirs.push(dir); const marker = join(dir, 'legacy'); writeFileSync(marker, 'x');
    const result = invoke('live', marker);
    expect(result.stdout).toContain('-p\n/morning-brief');
    expect(result.stdout).not.toContain('--json-schema');
  });
  it('preserves wrapper timeout, lock, status, notification, and zero-exit controls', () => {
    const shell = readFileSync(resolve(root, 'scripts/cron/morning-brief.sh'), 'utf8');
    expect(shell).toContain('CLAUDE_TIMEOUT=1800');
    expect(shell).toContain('LOCK_AGE" -lt 3600'); expect(shell).toContain('os.killpg');
    expect(shell).toContain('cron-status.tsv'); expect(shell).toContain('display notification');
    expect(shell.trimEnd()).toMatch(/exit 0$/);
  });
});
