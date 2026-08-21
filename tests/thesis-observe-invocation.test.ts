import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = process.cwd();
const invocation = resolve(root, 'scripts/cron/thesis-observe-invocation.sh');
const temporaryDirectories: string[] = [];

function fakePrinter(directory: string, name: string) {
  const fake = join(directory, name);
  writeFileSync(fake, '#!/bin/sh\nprintf \'%s\\n\' "$@"\n');
  chmodSync(fake, 0o755);
  return fake;
}

function invoke(mode: string, markers: { legacy?: string; claude?: string } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'thesis-observe-invocation-'));
  temporaryDirectories.push(directory);
  return spawnSync('/bin/bash', [invocation, mode], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      TJ_THESIS_OBSERVE_SKIP_ENV: '1',
      TJ_THESIS_OBSERVE_CODEX_BIN: fakePrinter(directory, 'codex'),
      TJ_THESIS_OBSERVE_CLAUDE_BIN: fakePrinter(directory, 'claude'),
      TJ_THESIS_OBSERVE_ROLLBACK_MARKER: markers.legacy ?? join(directory, 'rollback-marker'),
      TJ_THESIS_OBSERVE_CLAUDE_MARKER: markers.claude ?? join(directory, 'claude-marker'),
    },
  });
}

function schemaAfterFlag(stdout: string, flag: string) {
  const lines = stdout.split('\n');
  const index = lines.indexOf(flag);
  expect(index).toBeGreaterThan(-1);
  return lines[index + 1];
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('governed thesis-observe invocation', () => {
  it('pins live execution to the governed Codex adapter with the Tier-1 bound', () => {
    const result = invoke('live');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('capabilities/thesis-observation/adapters/codex.md');
    expect(result.stdout).toContain('"maxTheses":14');
    expect(result.stdout).toMatch(/^exec\n/);
    expect(result.stdout).toContain('--ephemeral');
    expect(result.stdout).toMatch(/(?:^|\n)(?:-C|--cd)\n/);
    expect(result.stdout).toContain('--output-schema');
    expect(result.stdout).not.toContain('--json-schema');
    expect(result.stdout).not.toContain('--model\nopus');
    const schemaPath = schemaAfterFlag(result.stdout, '--output-schema');
    expect(readFileSync(schemaPath, 'utf8')).toContain('"thesesObserved":{"type":"array"}');
  });

  it('makes shadow read-only and canary one-thesis bounded', () => {
    const shadow = invoke('shadow');
    const canary = invoke('canary');
    expect(shadow.stdout).toContain('capabilities/thesis-observation/adapters/codex.md');
    expect(shadow.stdout).toContain('"maxTheses":1');
    expect(shadow.stdout).toContain('READ-ONLY SHADOW');
    expect(shadow.stdout).toContain('writes empty');
    expect(canary.stdout).toContain('"maxTheses":1');
    expect(canary.stdout).toContain('CANARY');
    expect(canary.stdout).toContain('--thesis-observe-only');
    expect(canary.stdout).toContain('refuse a path that would write intel_items');
  });

  it('uses the governed Claude adapter when the Claude marker is present', () => {
    const directory = mkdtempSync(join(tmpdir(), 'thesis-observe-claude-'));
    temporaryDirectories.push(directory);
    const marker = join(directory, 'use-claude');
    writeFileSync(marker, 'test\n');
    const result = invoke('live', { claude: marker });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('capabilities/thesis-observation/adapters/claude.md');
    expect(result.stdout).toContain('--json-schema');
    expect(result.stdout).toContain('--model\nopus');
    expect(result.stdout).not.toContain('--output-schema');
    expect(result.stderr).toContain('Claude marker present');
  });

  it('prefers the Claude governed marker over the legacy slash-command marker', () => {
    const directory = mkdtempSync(join(tmpdir(), 'thesis-observe-both-'));
    temporaryDirectories.push(directory);
    const claude = join(directory, 'use-claude');
    const legacy = join(directory, 'use-legacy');
    writeFileSync(claude, 'test\n');
    writeFileSync(legacy, 'test\n');
    const result = invoke('live', { claude, legacy });
    expect(result.stdout).toContain('capabilities/thesis-observation/adapters/claude.md');
    expect(result.stdout).toContain('--json-schema');
    expect(result.stdout).not.toContain('-p\n/thesis-observe\n--model\nopus');
  });

  it('restores the exact legacy command through the rollback marker', () => {
    const directory = mkdtempSync(join(tmpdir(), 'thesis-observe-rollback-'));
    temporaryDirectories.push(directory);
    const marker = join(directory, 'legacy');
    writeFileSync(marker, 'test\n');
    const result = invoke('live', { legacy: marker });
    expect(result.stdout).toContain('-p\n/thesis-observe\n--model\nopus');
    expect(result.stdout).not.toContain('--json-schema');
    expect(result.stdout).not.toContain('--output-schema');
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
    expect(plist).toContain('/Users/home-hub/.local/bin');
  });
});
