import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  digestBeliefResearchRelationContext,
  prepareBeliefResearchRelationRecording,
  validateBeliefResearchRelationContext,
  validateBeliefResearchRelationResult,
  type BeliefResearchRelationContext,
  type BeliefResearchRelationReadyResult,
} from '../src/lib/intelligence/beliefResearchRelation.js';

const root = resolve(process.cwd(), 'capabilities/belief-research-relation');
const workspaceRoot = process.env.WORKSPACE_REPOSITORY_ROOT;
const governanceIt = workspaceRoot ? it : it.skip;

function read(path: string): string { return readFileSync(resolve(root, path), 'utf8'); }
function readJson(path: string): Record<string, unknown> { return JSON.parse(read(path)) as Record<string, unknown>; }
function digest(path: string): string {
  return `sha256:${createHash('sha256').update(read(path)).digest('hex')}`;
}
function inventoryEntry(path: string, id: string): Record<string, unknown> {
  const inventory = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as {
    entries: Array<Record<string, unknown>>;
  };
  const entry = inventory.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Missing inventory entry ${id}`);
  return entry;
}

describe('belief-research-relation Capability', () => {
  it('publishes the exact authority, semantic-bearing, provenance, decision, and write contract', () => {
    const capability = readJson('capability-package.json');
    expect(capability).toMatchObject({
      id: 'capability:scope:trade-journal/belief-research-relation',
      authority: 'scope:trade-journal', version: '1.0.1',
      dependencies: [
        { id: 'capability:scope:trade-journal/claims-synthesis', version_constraint: '>=1.0.0 <2.0.0' },
        { id: 'capability:scope:trade-journal/research-publication', version_constraint: '>=1.0.0 <2.0.0' },
      ],
    });
    const contract = String(capability.contract);
    for (const text of [
      'developing and monitoring', 'direct semantic proof', 'never duplicate',
      'unresolved Decision Item', 'short-lived exact user authorization',
      'every refuting relation', 'tentative supporting or foundational relation',
      'claim_thesis_mappings', 'journal audit',
    ]) expect(contract).toContain(text);
  });

  it('keeps exact Claude and Codex adapter semantics equivalent', () => {
    const [claude, codex] = ['claude', 'codex'].map((provider) => read(`adapters/${provider}.md`));
    const normalize = (adapter: string) => adapter
      .replace(/^## (Claude|Codex) Provider Adapter\n\n/, '')
      .replace(/use Codex's repository command runner for /g, '')
      .replace(/using Codex's repository command runner for /g, '')
      .replace(/running /g, '')
      .replace(/run /g, '')
      .replace(/sandbox denial, /g, '');
    expect(normalize(claude)).toBe(normalize(codex));
    for (const adapter of [claude, codex]) {
      for (const text of [
        'Notes/Tana owns capture, source material, and Toulmin extraction',
        '`(sourceInsightId, sourceClaimId)` provenance is identity',
        'Holdings are not an information gate',
        'Ticker overlap, keyword overlap, and provider recommendation are never semantic proof',
        'Do not silently link an ambiguous claim',
        'Every refuting relation must also surface an unresolved `review_refuting_claim` Decision Item',
        'Medium- or low-confidence supporting or foundational relations must also surface an unresolved `confirm_claim_link` Decision Item',
        'scripts/ops/record-belief-research-relation.ts --stdin',
        'unresolved `decision_required` `journal_entries` with `resolution: null`',
        'must not create or mutate `main_claims`',
        'must not resolve a Decision Item',
        'must not use ad-hoc SQL or Drizzle writes, Supabase MCP writes, direct API mutation',
        'must not create an authorization token, invoke the recorder',
      ]) expect(adapter).toContain(text);
      expect(adapter).not.toContain('scripts/relate-research.ts --apply');
      expect(adapter).not.toContain('/api/');
    }
  });

  it('gives headless execution complete read-only parameters and refuses genuine judgment or writes', () => {
    const claudePreamble = read('../../.claude/skills/relate-research/HEADLESS_PREAMBLE.md');
    const codexPreamble = read('../../.agents/skills/relate-research/HEADLESS_PREAMBLE.md');
    expect(codexPreamble).toBe(claudePreamble);
    for (const text of ['`mode`: exactly `prepare` or `validate_result`', '`insightId`',
      '`preparedContext`', '`providerResult`', 'Do not create a `belief_research_relation_authorization` token',
      'Do not run', 'legacy `scripts/relate-research.ts --apply`', '"writes": []']) {
      expect(claudePreamble).toContain(text);
    }
  });

  it('binds representative semantic output to exact adapter bytes without claiming live invocation', () => {
    const fixture = readJson('../../tests/fixtures/belief-research-relation-adapter-equivalence.json') as {
      limitation: string;
      providers: Record<'claude' | 'codex', { adapterDigest: string }>;
      context: BeliefResearchRelationContext;
      result: BeliefResearchRelationReadyResult;
      expected: Record<string, unknown>;
    };
    expect(fixture.limitation).toContain('No live provider invocation');
    const argument = fixture.context.thesisTargets[0].argument;
    const contextFromFixture = structuredClone(fixture.context);
    contextFromFixture.thesisTargets[0].argument.digest = `sha256:${createHash('sha256').update(JSON.stringify({
      coreArgument: argument.coreArgument,
      keyAssumptions: argument.keyAssumptions,
      keyDrivers: argument.keyDrivers,
      source: argument.source,
    })).digest('hex')}`;
    const context = validateBeliefResearchRelationContext(contextFromFixture);
    fixture.result.contextDigest = digestBeliefResearchRelationContext(context);
    const outcomes = (['claude', 'codex'] as const).map((provider) => {
      expect(fixture.providers[provider].adapterDigest).toBe(digest(`adapters/${provider}.md`));
      const result = validateBeliefResearchRelationResult(context, fixture.result);
      const prepared = prepareBeliefResearchRelationRecording(context, result);
      return {
        status: prepared.status,
        mainClaimId: prepared.relationCandidates[0].mainClaimId,
        thesisStatus: context.thesisTargets[0].status,
        relationship: prepared.relationCandidates[0].relationship,
        writeTables: prepared.permittedWriteSurface.tables,
        decisionCount: prepared.decisionCandidates.length,
        execution: prepared.execution,
      };
    });
    expect(outcomes[0]).toEqual(fixture.expected); expect(outcomes[1]).toEqual(outcomes[0]);
  });

  it('binds exact package and adapter bytes to complete current evidence', () => {
    for (const provider of ['claude', 'codex']) {
      const evidence = readJson(`evidence/${provider}.json`);
      const results = evidence.results as Record<string, { status: string }>;
      expect(evidence.package_digest).toBe(digest('capability-package.json'));
      expect(evidence.adapter_digest).toBe(digest(`adapters/${provider}.md`));
      expect(evidence.support_state).toBe('current');
      expect(Object.values(results).every(({ status }) => status === 'passed')).toBe(true);
    }
  });

  it('exposes one read-only CLI and one exact recorder while refusing wider entry points', () => {
    const help = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/belief-research-relation.ts', '--help'], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
    });
    expect(help.status).toBe(0); expect(help.stdout).toContain('belief-research-relation (read-only)');
    expect(help.stdout).toContain('There is intentionally no apply, claim creation, status change, decision resolution');
    for (const option of ['--sql', '--supabase-mcp-write', '--api-mutate', '--status-change', '--resolve-decision', '--trade']) {
      const refused = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/belief-research-relation.ts', option], {
        cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
      });
      expect(refused.status).toBe(1); expect(refused.stderr).toContain(`Unsupported option ${option}`);
    }
    const operation = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ops/record-belief-research-relation.ts', '--help'], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
    });
    expect(operation.status).toBe(0);
    expect(operation.stdout).toContain('only governed belief-research relation mutation boundary');
    expect(operation.stdout).toContain('only claim_thesis_mappings and unresolved/audit journal_entries');
  });

  it('reconciles interactive and headless inventories with genuine unattended eligibility', () => {
    const interactive = inventoryEntry('docs/agents/provider-adapters/interactive-inventory.json', 'interactive-claude-relate-research');
    const headless = inventoryEntry('docs/agents/provider-adapters/headless-inventory.json', 'headless-codex-relate-research');
    expect(interactive).toMatchObject({
      source: { path: 'capabilities/belief-research-relation/adapters/claude.md' },
      packaging: 'governed-provider-adapter',
      invocation: { unattended_eligibility: 'ineligible' },
      authority_and_write_scope: { writes: expect.stringContaining('claim_thesis_mappings') },
    });
    expect(headless).toMatchObject({
      source: { path: 'capabilities/belief-research-relation/adapters/codex.md' },
      packaging: 'governed-provider-adapter',
      execution_contract: { class: 'bespoke', preamble_path: '.claude/skills/relate-research/HEADLESS_PREAMBLE.md' },
      invocation: { unattended_eligibility: 'conditional' },
      authority_and_write_scope: { writes: expect.stringContaining('No unattended writes') },
    });
  });

  governanceIt('validates the exact package through the accepted public Workspace CLI', () => {
    const report = JSON.parse(spawnSync('./workspace', [
      'validate', 'capability', 'capabilities/belief-research-relation',
      '--evidence-time', '2026-08-09', '--format', 'json',
    ], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, WORKSPACE_REPOSITORY_ROOT: workspaceRoot } }).stdout) as {
      outcome: string; adapters: Array<{ state: string }>;
    };
    expect(report.outcome).toBe('valid');
    expect(report.adapters.map(({ state }) => state)).toEqual(['current', 'current']);
  });
});
