import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const invocation = resolve(repoRoot, 'scripts/cron/maintenance-invocation.sh');
const wrapper = resolve(repoRoot, 'scripts/cron/maintenance.sh');
const plist = resolve(repoRoot, 'launchd/com.trade-journal.maintenance.plist');
const temporaryDirectories: string[] = [];

function fakeClaude(): string {
  const directory = mkdtempSync(join(tmpdir(), 'maintenance-invocation-'));
  temporaryDirectories.push(directory);
  const executable = join(directory, 'claude');
  writeFileSync(executable, '#!/bin/sh\nprintf \'%s\\n\' "$@"\n');
  chmodSync(executable, 0o755);
  return executable;
}

function invoke(mode: string, rollbackMarker?: string): ReturnType<typeof spawnSync> {
  return spawnSync('/bin/bash', [invocation, mode], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      TJ_MAINTENANCE_CLAUDE_BIN: fakeClaude(),
      ...(rollbackMarker ? { TJ_MAINTENANCE_ROLLBACK_MARKER: rollbackMarker } : {}),
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('governed maintenance invocation', () => {
  it('pins live execution to the governed adapter and the existing bounded workload', () => {
    const result = invoke('live');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('capabilities/belief-maintenance/adapters/claude.md');
    expect(result.stdout).toContain('"mode":"maintenance"');
    expect(result.stdout).toContain('"relateResearch":30');
    expect(result.stdout).toContain('"dryRun":false');
    expect(result.stdout).toContain('--model\nopus');
    expect(result.stdout).toContain('--json-schema');
  });

  it('makes shadow execution read-only and canary execution globally bounded', () => {
    const shadow = invoke('shadow');
    const canary = invoke('canary');
    expect(shadow.status).toBe(0);
    expect(shadow.stdout).toContain('"maxItemsTotal":1');
    expect(shadow.stdout).toContain('"dryRun":true');
    expect(shadow.stdout).toContain('perform reads only');
    expect(canary.status).toBe(0);
    expect(canary.stdout).toContain('"maxItemsTotal":1');
    expect(canary.stdout).toContain('"dryRun":false');
  });

  it('restores the exact legacy invocation when the rollback marker is present', () => {
    const directory = mkdtempSync(join(tmpdir(), 'maintenance-rollback-'));
    temporaryDirectories.push(directory);
    const rollbackMarker = join(directory, 'use-legacy');
    writeFileSync(rollbackMarker, 'rollback test\n');
    const result = invoke('live', rollbackMarker);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('using legacy /maintenance invocation');
    expect(result.stdout).toContain('-p\n/maintenance\n--model\nopus');
    expect(result.stdout).not.toContain('--json-schema');
  });

  it('preserves the wrapper and launchd operational contract', () => {
    const shell = readFileSync(wrapper, 'utf8');
    const launchd = readFileSync(plist, 'utf8');
    expect(shell).toContain('CLAUDE_TIMEOUT=2400');
    expect(shell).toContain('LOCK_AGE');
    expect(shell).toContain('-lt 3000');
    expect(shell).toContain('os.killpg');
    expect(shell).toContain('cron-status.tsv');
    expect(shell).toContain('display notification');
    expect(shell.trimEnd()).toMatch(/exit 0$/);
    expect(launchd).toContain('<integer>8</integer>');
    expect(launchd).toContain('<integer>20</integer>');
    expect(launchd).toContain('<false/>');
  });
});
