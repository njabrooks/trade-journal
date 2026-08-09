import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'capabilities/research-pipeline');

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

function fileDigest(path: string): string {
  return `sha256:${createHash('sha256').update(read(path)).digest('hex')}`;
}

describe('research-pipeline Capability', () => {
  it('publishes only the provider-neutral aggregate identity with exact governed dependencies', () => {
    const capability = readJson('capability-package.json');
    expect(capability).toMatchObject({
      id: 'capability:scope:trade-journal/research-pipeline',
      authority: 'scope:trade-journal',
      version: '1.0.0',
      dependencies: [
        { id: 'capability:scope:trade-journal/claims-synthesis', version_constraint: '>=1.0.0 <2.0.0' },
        { id: 'capability:scope:trade-journal/research-publication', version_constraint: '>=1.0.0 <2.0.0' },
        { id: 'capability:scope:trade-journal/belief-research-relation', version_constraint: '>=1.0.0 <2.0.0' },
      ],
    });
    const contract = String(capability.contract);
    for (const text of [
      'Notes/Tana owns capture, source material, and Toulmin extraction',
      'explicitly unmigrated',
      'incomplete, unavailable, stale, refused, failed, judgment_required, or ready',
      'purpose-built operation',
      'no database authority',
    ]) expect(contract).toContain(text);
  });

  it('keeps exact Claude and Codex aggregate adapter semantics equivalent and zero-authority', () => {
    const [claude, codex] = ['claude', 'codex'].map((provider) => read(`adapters/${provider}.md`));
    const normalize = (adapter: string) => adapter
      .replace(/^## (Claude|Codex) Provider Adapter\n\n/, '')
      .replaceAll("Claude's repository command runner", 'the repository command runner')
      .replaceAll("Codex's repository command runner", 'the repository command runner');
    expect(normalize(claude)).toBe(normalize(codex));
    for (const adapter of [claude, codex]) {
      for (const text of [
        'scripts/research-pipeline.ts --describe',
        'scripts/research-pipeline.ts --evaluate',
        'claims-synthesis',
        'research-publication',
        'belief-research-relation',
        'scripts/ops/publish-research.ts --stdin',
        'scripts/ops/record-belief-research-relation.ts --stdin',
        'Legacy stage entry points remain active',
        'must not use ad-hoc SQL, Supabase MCP writes, direct API mutation, or generic writes',
        'must not change status, resolve a Decision Item, mutate a strategy or position, or place or stage a trade',
      ]) expect(adapter).toContain(text);
    }
  });

  it('exposes a read-only aggregate CLI and refuses wider authority before database access', () => {
    const help = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/research-pipeline.ts', '--help'], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('research-pipeline (read-only aggregate)');
    expect(help.stdout).toContain('There is intentionally no apply, publish, relation, status, decision, strategy, position, trade');
    for (const option of ['--sql', '--supabase-mcp-write', '--api-mutate', '--scheduler', '--credentials', '--trade']) {
      const refused = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/research-pipeline.ts', option], {
        cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
      });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain(`Unsupported option ${option}`);
    }
  });

  it('binds exact package and adapter bytes to current evidence without claiming migrated legacy stages', () => {
    for (const provider of ['claude', 'codex']) {
      const evidence = readJson(`evidence/${provider}.json`);
      expect(evidence.package_digest).toBe(fileDigest('capability-package.json'));
      expect(evidence.adapter_digest).toBe(fileDigest(`adapters/${provider}.md`));
      expect(evidence.support_state).toBe('current');
      expect(String(evidence.limitations)).toContain('unmigrated');
    }
  });

  it('reconciles exact aggregate adapters into both inventories without replacing legacy discovery', () => {
    const pairs = [
      ['interactive-inventory.json', 'interactive-claude-pipeline-status', 'claude'],
      ['headless-inventory.json', 'headless-codex-pipeline-status', 'codex'],
    ] as const;
    for (const [inventoryName, entryId, provider] of pairs) {
      const inventory = JSON.parse(readFileSync(resolve(
        process.cwd(), 'docs/agents/provider-adapters', inventoryName,
      ), 'utf8')) as { entries: Array<Record<string, unknown>> };
      const entry = inventory.entries.find(({ id }) => id === entryId) as Record<string, unknown>;
      expect(entry.source).toEqual(expect.objectContaining({
        path: `capabilities/research-pipeline/adapters/${provider}.md`,
      }));
      expect(entry.migration_input).toEqual(expect.objectContaining({
        path: provider === 'claude'
          ? '.claude/skills/pipeline-status/SKILL.md'
          : '.agents/skills/pipeline-status/SKILL.md',
      }));
      expect(entry.evidence).toEqual(expect.objectContaining({ state: 'current' }));
      expect(entry.governed_binding).toEqual(expect.objectContaining({
        package_path: 'capabilities/research-pipeline/capability-package.json',
      }));
    }
    expect(readFileSync(resolve(process.cwd(), '.claude/skills/pipeline-status/SKILL.md'), 'utf8'))
      .toContain('Pipeline Status');
    expect(readFileSync(resolve(process.cwd(), '.agents/skills/pipeline-status/SKILL.md'), 'utf8'))
      .toContain('Pipeline Status');
  });
});
