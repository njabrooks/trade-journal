import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = process.cwd();
const invocation = resolve(root, 'scripts/cron/thesis-observe-invocation.sh');
const temporaryDirectories: string[] = [];

function invoke(mode: string, marker?: string) {
  const directory = mkdtempSync(join(tmpdir(), 'thesis-observe-invocation-'));
  temporaryDirectories.push(directory);
  const fake = join(directory, 'claude');
  writeFileSync(fake, '#!/bin/sh\nprintf \'%s\\n\' "$@"\n');
  chmodSync(fake, 0o755);
  return spawnSync('/bin/bash', [invocation, mode], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      TJ_THESIS_OBSERVE_CLAUDE_BIN: fake,
      TJ_THESIS_OBSERVE_ROLLBACK_MARKER: marker ?? join(directory, 'rollback-marker'),
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('governed thesis-observe invocation', () => {
  it('pins live execution to the governed adapter with the Tier-1 bound', () => {
    const result = invoke('live');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('capabilities/thesis-observation/adapters/claude.md');
    expect(result.stdout).toContain('"maxTheses":14');
    expect(result.stdout).toContain('--model\nopus');
    expect(result.stdout).toContain('--json-schema');
  });

  it('makes shadow read-only and canary one-thesis bounded', () => {
    const shadow = invoke('shadow');
    const canary = invoke('canary');
    expect(shadow.stdout).toContain('"maxTheses":1');
    expect(shadow.stdout).toContain('READ-ONLY SHADOW');
    expect(shadow.stdout).toContain('writes empty');
    expect(canary.stdout).toContain('"maxTheses":1');
    expect(canary.stdout).toContain('CANARY');
    expect(canary.stdout).toContain('--thesis-observe-only');
    expect(canary.stdout).toContain('refuse a path that would write intel_items');
  });

  it('restores the exact legacy command through the rollback marker', () => {
    const directory = mkdtempSync(join(tmpdir(), 'thesis-observe-rollback-'));
    temporaryDirectories.push(directory);
    const marker = join(directory, 'legacy');
    writeFileSync(marker, 'test\n');
    const result = invoke('live', marker);
    expect(result.stdout).toContain('-p\n/thesis-observe\n--model\nopus');
    expect(result.stdout).not.toContain('--json-schema');
  });

  it('preserves the wrapper and launchd operational controls', () => {
    const shell = readFileSync(resolve(root, 'scripts/cron/thesis-observe.sh'), 'utf8');
    const plist = readFileSync(resolve(root, 'launchd/com.trade-journal.thesis-observe.plist'), 'utf8');
    expect(shell).toContain('CLAUDE_TIMEOUT=3000');
    expect(shell).toContain('-lt 3600');
    expect(shell).toContain('os.killpg');
    expect(shell).toContain('cron-status.tsv');
    expect(shell).toContain('display notification');
    expect(shell.trimEnd()).toMatch(/exit 0$/);
    expect(plist).toContain('<integer>7</integer>');
    expect(plist).toContain('<false/>');
  });
});
