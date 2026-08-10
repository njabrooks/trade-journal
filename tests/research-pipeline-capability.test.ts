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
      version: '1.2.0',
      dependencies: [
        { id: 'capability:scope:trade-journal/claims-synthesis', version_constraint: '>=1.0.0 <2.0.0' },
        { id: 'capability:scope:trade-journal/research-publication', version_constraint: '>=1.0.0 <2.0.0' },
        { id: 'capability:scope:trade-journal/belief-research-relation', version_constraint: '>=1.0.0 <2.0.0' },
        { id: 'capability:scope:trade-journal/thesis-underwriting', version_constraint: '>=1.0.0 <2.0.0' },
      ],
    });
    const contract = String(capability.contract);
    for (const text of [
      'Notes/Tana owns capture, source material, and Toulmin extraction',
      'All ten legacy',
      'rollback-capable',
      'judgment_required',
      'No stage or aggregate has scheduler',
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
        'scripts/research-pipeline.ts',
        '--describe',
        '--evaluate',
        '--pipeline-status',
        '--idea-intake',
        '--thesis-formalization',
        '--unknown-mapping',
        '--research-preparation',
        '--unknown-research',
        '--evidence-synthesis',
        '--thesis-expression',
        '--gate-decision',
        '--graduation',
        'claims-synthesis',
        'research-publication',
        'belief-research-relation',
        'scripts/ops/publish-research.ts --stdin',
        'scripts/ops/record-belief-research-relation.ts --stdin',
        'All ten legacy entry points',
        'rollback-capable',
        'issue #69 contraction',
        'must not use ad-hoc SQL, Supabase MCP writes, direct API mutation, generic writes',
        'must not change status, resolve a Decision Item, configure signals, mutate a strategy or position, or place or stage an order or trade',
      ]) expect(adapter).toContain(text);
    }
  });

  it('exposes a read-only aggregate CLI and refuses wider authority before database access', () => {
    const help = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/research-pipeline.ts', '--help'], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('research-pipeline (read-only aggregate)');
    for (const option of [
      '--pipeline-status', '--idea-intake', '--thesis-formalization', '--unknown-mapping',
      '--research-preparation', '--unknown-research', '--evidence-synthesis',
      '--thesis-expression', '--gate-decision', '--graduation',
      '--validate-stage-result',
    ]) expect(help.stdout).toContain(option);
    expect(help.stdout).toContain('There is intentionally no apply, publish, relation, status, decision, strategy, position, trade');
    for (const option of ['--sql', '--supabase-mcp-write', '--api-mutate', '--scheduler', '--credentials', '--trade']) {
      const refused = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/research-pipeline.ts', option], {
        cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
      });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain(`Unsupported option ${option}`);
    }
    const ambiguous = spawnSync(process.execPath, [
      '--import', 'tsx', 'scripts/research-pipeline.ts',
      '--describe', '--insight-id', '11111111-1111-4111-8111-111111111111', '--pipeline-status', '-',
    ], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' }, input: '{}',
    });
    expect(ambiguous.status).toBe(1);
    expect(ambiguous.stderr).toContain('Exactly one read-only stage');
    const stray = spawnSync(process.execPath, [
      '--import', 'tsx', 'scripts/research-pipeline.ts', '--pipeline-status', '-', 'write-anyway',
    ], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' }, input: '{}',
    });
    expect(stray.status).toBe(1);
    expect(stray.stderr).toContain('Unsupported positional argument write-anyway');
    const describeStray = spawnSync(process.execPath, [
      '--import', 'tsx', 'scripts/research-pipeline.ts', '--describe',
      '--insight-id', '11111111-1111-4111-8111-111111111111', 'write-anyway',
    ], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' } });
    expect(describeStray.status).toBe(1);
    expect(describeStray.stderr).toContain('Unsupported positional argument write-anyway');

    const pipelineStatus = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/research-pipeline.ts', '--pipeline-status', '-'],
      {
        cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
        input: JSON.stringify({
          targetInsightId: '11111111-1111-4111-8111-111111111111',
          asOf: '2026-08-10T08:00:00.000Z', ideas: [], kills: [],
        }),
      },
    );
    expect(pipelineStatus.status).toBe(0);
    expect(JSON.parse(pipelineStatus.stdout)).toMatchObject({
      stage: 'pipeline_status', status: 'ready', execution: { mode: 'stage_result_only', writes: [] },
    });
  });

  it('binds exact package and adapter bytes to current evidence without claiming legacy contraction', () => {
    for (const provider of ['claude', 'codex']) {
      const evidence = readJson(`evidence/${provider}.json`);
      expect(evidence.package_digest).toBe(fileDigest('capability-package.json'));
      expect(evidence.adapter_digest).toBe(fileDigest(`adapters/${provider}.md`));
      expect(evidence.support_state).toBe('current');
      expect(String(evidence.limitations)).toContain('Legacy persistence for all ten stage boundaries remains active');
    }
  });

  it('reconciles exact aggregate adapters into both inventories without replacing legacy discovery', () => {
    const pairs = [
      ['interactive-inventory.json', 'interactive-claude-pipeline-status', 'claude'],
      ['headless-inventory.json', 'headless-codex-pipeline-status', 'codex'],
      ['interactive-inventory.json', 'interactive-claude-stage-1-init-idea', 'claude'],
      ['interactive-inventory.json', 'interactive-claude-stage-2-formalize-thesis', 'claude'],
      ['interactive-inventory.json', 'interactive-claude-stage-3-map-unknowns', 'claude'],
      ['headless-inventory.json', 'headless-codex-stage-1-init-idea', 'codex'],
      ['headless-inventory.json', 'headless-codex-stage-2-formalize-thesis', 'codex'],
      ['headless-inventory.json', 'headless-codex-stage-3-map-unknowns', 'codex'],
      ['interactive-inventory.json', 'interactive-claude-stage-4a-prep-desktop-research', 'claude'],
      ['interactive-inventory.json', 'interactive-claude-stage-4a-research-unknown', 'claude'],
      ['interactive-inventory.json', 'interactive-claude-stage-4b-synthesize-evidence', 'claude'],
      ['interactive-inventory.json', 'interactive-claude-stage-5-express-thesis', 'claude'],
      ['interactive-inventory.json', 'interactive-claude-advance-or-kill', 'claude'],
      ['interactive-inventory.json', 'interactive-claude-graduate-pipeline-idea', 'claude'],
      ['headless-inventory.json', 'headless-codex-stage-4a-prep-desktop-research', 'codex'],
      ['headless-inventory.json', 'headless-codex-stage-4a-research-unknown', 'codex'],
      ['headless-inventory.json', 'headless-codex-stage-4b-synthesize-evidence', 'codex'],
      ['headless-inventory.json', 'headless-codex-stage-5-express-thesis', 'codex'],
      ['headless-inventory.json', 'headless-codex-advance-or-kill', 'codex'],
      ['headless-inventory.json', 'headless-codex-graduate-pipeline-idea', 'codex'],
    ] as const;
    for (const [inventoryName, entryId, provider] of pairs) {
      const inventory = JSON.parse(readFileSync(resolve(
        process.cwd(), 'docs/agents/provider-adapters', inventoryName,
      ), 'utf8')) as { entries: Array<Record<string, unknown>> };
      const entry = inventory.entries.find(({ id }) => id === entryId) as Record<string, unknown>;
      expect(entry.source).toEqual(expect.objectContaining({
        path: `capabilities/research-pipeline/adapters/${provider}.md`,
      }));
      const legacyName = entryId.replace(
        provider === 'claude' ? 'interactive-claude-' : 'headless-codex-',
        '',
      );
      expect(entry.migration_input).toEqual(expect.objectContaining({
        path: provider === 'claude'
          ? `.claude/skills/${legacyName}/SKILL.md`
          : `.agents/skills/${legacyName}/SKILL.md`,
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
    for (const stage of [
      'stage-1-init-idea', 'stage-2-formalize-thesis', 'stage-3-map-unknowns',
      'stage-4a-prep-desktop-research', 'stage-4a-research-unknown', 'stage-4b-synthesize-evidence',
      'stage-5-express-thesis', 'advance-or-kill', 'graduate-pipeline-idea',
    ]) {
      expect(readFileSync(resolve(process.cwd(), `.claude/skills/${stage}/SKILL.md`), 'utf8').length)
        .toBeGreaterThan(0);
      expect(readFileSync(resolve(process.cwd(), `.agents/skills/${stage}/SKILL.md`), 'utf8').length)
        .toBeGreaterThan(0);
    }
  });
});
