import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = process.cwd();
const invocation = resolve(root, 'scripts/cron/morning-brief-invocation.sh');
const dirs: string[] = [];

function fakePrinter(directory: string, name: string) {
  const fake = join(directory, name);
  writeFileSync(fake, '#!/bin/sh\nprintf \'%s\\n\' "$@"\n');
  chmodSync(fake, 0o755);
  return fake;
}

function invoke(runMode: string, markers: { legacy?: string; claude?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'morning-brief-invocation-'));
  dirs.push(dir);
  const date = join(dir, 'date');
  writeFileSync(date, '#!/bin/sh\necho 2026-08-07\n');
  chmodSync(date, 0o755);
  return spawnSync('/bin/bash', [invocation, runMode], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      TJ_MORNING_BRIEF_SKIP_ENV: '1',
      TJ_MORNING_BRIEF_CODEX_BIN: fakePrinter(dir, 'codex'),
      TJ_MORNING_BRIEF_CLAUDE_BIN: fakePrinter(dir, 'claude'),
      TJ_MORNING_BRIEF_DATE_BIN: date,
      TJ_MORNING_BRIEF_ROLLBACK_MARKER: markers.legacy ?? join(dir, 'marker'),
      TJ_MORNING_BRIEF_CLAUDE_MARKER: markers.claude ?? join(dir, 'claude-marker'),
    },
  });
}

function schemaAfterFlag(stdout: string, flag: string) {
  const lines = stdout.split('\n');
  const index = lines.indexOf(flag);
  expect(index).toBeGreaterThan(-1);
  return lines[index + 1];
}

afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('morning brief provider selector', () => {
  it('governs live synthesis with exactly one upsert and belief-write refusals', () => {
    const result = invoke('live');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('capabilities/morning-attention-brief/adapters/codex.md');
    expect(result.stdout).toContain('-m\ngpt-5.6-luna');
    expect(result.stdout).toContain('"briefDate":"2026-08-07","dryRun":false');
    expect(result.stdout).toContain('exactly once');
    expect(result.stdout).toContain('Never write journal_entries');
    expect(result.stdout).toMatch(/^exec\n/);
    expect(result.stdout).toContain('--ephemeral');
    expect(result.stdout).toMatch(/(?:^|\n)(?:-C|--cd)\n/);
    expect(result.stdout).toContain('--output-schema');
    expect(result.stdout).not.toContain('--json-schema');
    const schemaPath = schemaAfterFlag(result.stdout, '--output-schema');
    const schema = readFileSync(schemaPath, 'utf8');
    expect(schema).toContain('"freshness":{"type":"object"');
    expect(schema).toContain('"write":{"anyOf"');
  });
  it('keeps shadow read-only and canary bounded to the sole upsert', () => {
    const shadow = invoke('shadow'); const canary = invoke('canary');
    expect(shadow.stdout).toContain('capabilities/morning-attention-brief/adapters/codex.md');
    expect(shadow.stdout).toContain('"dryRun":true'); expect(shadow.stdout).toContain('persisted must be false');
    expect(canary.stdout).toContain('CANARY: perform exactly one same-date morning_briefs upsert');
    expect(canary.stdout).toContain('at most five attention items');
  });
  it('uses the governed Claude adapter when the Claude marker is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'morning-brief-claude-')); dirs.push(dir);
    const marker = join(dir, 'use-claude'); writeFileSync(marker, 'x');
    const result = invoke('live', { claude: marker });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('capabilities/morning-attention-brief/adapters/claude.md');
    expect(result.stdout).toContain('--json-schema');
    expect(result.stdout).toContain('"freshness":{"type":"object"');
    expect(result.stdout).toContain('"write":{"anyOf"');
    expect(result.stdout).not.toContain('--output-schema');
  });
  it('prefers the Claude governed marker over the legacy slash-command marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'morning-brief-both-')); dirs.push(dir);
    const claude = join(dir, 'use-claude'); const legacy = join(dir, 'use-legacy');
    writeFileSync(claude, 'x'); writeFileSync(legacy, 'x');
    const result = invoke('live', { claude, legacy });
    expect(result.stdout).toContain('capabilities/morning-attention-brief/adapters/claude.md');
    expect(result.stdout).toContain('--json-schema');
    expect(result.stdout).not.toContain('-p\n/morning-brief');
  });
  it('restores the exact legacy invocation with a marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'morning-brief-rollback-')); dirs.push(dir); const marker = join(dir, 'legacy'); writeFileSync(marker, 'x');
    const result = invoke('live', { legacy: marker });
    expect(result.stdout).toContain('-p\n/morning-brief');
    expect(result.stdout).not.toContain('--json-schema');
    expect(result.stdout).not.toContain('--output-schema');
  });
  it('preserves wrapper timeout, lock, status, notification, and zero-exit controls', () => {
    const shell = readFileSync(resolve(root, 'scripts/cron/morning-brief.sh'), 'utf8');
    expect(shell).toContain('CLAUDE_TIMEOUT=1800');
    expect(shell).toContain('LOCK_AGE" -lt 3600'); expect(shell).toContain('os.killpg');
    expect(shell).toContain('cron-status.tsv'); expect(shell).toContain('display notification');
    expect(shell.trimEnd()).toMatch(/exit 0$/);
  });
});
