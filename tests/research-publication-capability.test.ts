import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildResearchPublication } from '../src/lib/intelligence/researchPublication.js';
import { digestClaimsSynthesisContext } from '../src/lib/intelligence/claimsSynthesis.js';

const capabilityRoot = resolve(process.cwd(), 'capabilities/research-publication');
const workspaceRoot = process.env.WORKSPACE_REPOSITORY_ROOT;
const workspaceEvidenceTime = process.env.WORKSPACE_EVIDENCE_TIME ?? '2026-08-09';
const governanceIt = workspaceRoot ? it : it.skip;

function read(path: string): string {
  return readFileSync(resolve(capabilityRoot, path), 'utf8');
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

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

describe('research-publication Capability', () => {
  it('publishes the exact authority, recommendation, authorization, and transactional contract', () => {
    const capability = readJson('capability-package.json');
    expect(capability).toMatchObject({
      id: 'capability:scope:trade-journal/research-publication',
      authority: 'scope:trade-journal',
      version: '1.0.1',
      dependencies: [{
        id: 'capability:scope:trade-journal/claims-synthesis',
        version_constraint: '>=1.0.0 <2.0.0',
      }],
    });
    expect(String(capability.contract)).toContain('Notes-owned source');
    expect(String(capability.contract)).toContain('short-lived user authorization token');
    expect(String(capability.contract)).toContain('atomically reuse exact provenance claims');
  });

  it('keeps exact Claude and Codex adapter semantics equivalent', () => {
    const [claude, codex] = ['claude', 'codex'].map((provider) => read(`adapters/${provider}.md`));
    const normalize = (adapter: string) => adapter
      .replace(/^## (Claude|Codex) Provider Adapter\n\n/, '')
      .replace("run `npx tsx scripts/research-publication.ts --prepare", "use the repository command runner for `npx tsx scripts/research-publication.ts --prepare")
      .replace("use Codex's repository command runner for `npx tsx scripts/research-publication.ts --prepare", "use the repository command runner for `npx tsx scripts/research-publication.ts --prepare")
      .replace("running `npx tsx scripts/research-publication.ts --validate-authorization", "using the repository command runner for `npx tsx scripts/research-publication.ts --validate-authorization")
      .replace("using Codex's repository command runner for `npx tsx scripts/research-publication.ts --validate-authorization", "using the repository command runner for `npx tsx scripts/research-publication.ts --validate-authorization")
      .replace('sandbox denial, ', '');
    expect(normalize(claude)).toBe(normalize(codex));

    for (const adapter of [claude, codex]) {
      expect(adapter).toContain('Claims synthesis is input recommendation, never publication authorization');
      expect(adapter).toContain('Notes/Tana owns capture, source material, and Toulmin extraction');
      expect(adapter).toContain('`(sourceInsightId, sourceClaimId)` provenance is deterministic identity');
      expect(adapter).toContain('Do not use ticker or keyword overlap as semantic proof');
      expect(adapter).toContain('Never infer, fabricate, broaden, reuse for different canonical content, or self-authorize a token');
      expect(adapter).toContain('scripts/ops/publish-research.ts --stdin');
      expect(adapter).toContain('sole mutation boundary');
      expect(adapter).toContain('must not use ad-hoc SQL or Drizzle writes, Supabase MCP writes, direct API mutation');
      expect(adapter).toContain('must not change any entity or thesis status or resolve any Decision Item');
      expect(adapter).toContain('cannot create an authorization token or invoke the recorder');
      expect(adapter).not.toContain('/api/research/promote-claim');
    }
  });

  it('gives headless validation complete supplied-input parameters without token-creation authority', () => {
    const preamble = read('../../.claude/skills/finalize-for-upload/HEADLESS_PREAMBLE.md');
    expect(preamble).toContain('Prepared publication result (validate mode)');
    expect(preamble).toContain('User-supplied authorization token (validate mode)');
    expect(preamble).toContain('Never create a `research_publication_authorization` token');
  });

  it('binds a representative equivalent result to exact adapters without claiming live invocation', () => {
    const fixture = readJson('../../tests/fixtures/research-publication-adapter-equivalence.json') as {
      limitation: string;
      providers: Record<'claude' | 'codex', { adapterDigest: string }>;
      context: Parameters<typeof buildResearchPublication>[0];
      claimsSynthesisResult: Record<string, unknown>;
      expected: Record<string, unknown>;
    };
    expect(fixture.limitation).toContain('No live provider invocation');
    fixture.claimsSynthesisResult.contextDigest = digestClaimsSynthesisContext(fixture.context);
    const outcomes = (['claude', 'codex'] as const).map((provider) => {
      expect(fixture.providers[provider].adapterDigest).toBe(digest(`adapters/${provider}.md`));
      const prepared = buildResearchPublication(fixture.context, fixture.claimsSynthesisResult);
      return {
        status: prepared.status,
        claimDisposition: prepared.claimCandidates[0].disposition,
        relationship: prepared.relationshipCandidates[0].relationship,
        writeTables: prepared.permittedWriteSurface.tables,
        execution: prepared.execution,
      };
    });
    expect(outcomes[0]).toEqual(fixture.expected);
    expect(outcomes[1]).toEqual(outcomes[0]);
  });

  it('binds exact package and adapter bytes to complete current evidence', () => {
    const packageDigest = digest('capability-package.json');
    for (const provider of ['claude', 'codex']) {
      const evidence = readJson(`evidence/${provider}.json`);
      const results = evidence.results as Record<string, { status: string }>;
      expect(evidence.package_digest).toBe(packageDigest);
      expect(evidence.adapter_digest).toBe(digest(`adapters/${provider}.md`));
      expect(evidence.support_state).toBe('current');
      expect(Object.values(results).every(({ status }) => status === 'passed')).toBe(true);
    }
  });

  it('exposes a read-only CLI and one exact operations boundary', () => {
    const readHelp = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/research-publication.ts', '--help'], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
    });
    expect(readHelp.status).toBe(0);
    expect(readHelp.stdout).toContain('research-publication (read-only)');
    expect(readHelp.stdout).toContain('There is intentionally no apply, publish, promote, link, status, decision');

    const refused = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/research-publication.ts', '--supabase-mcp-write'], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
    });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('Unsupported option --supabase-mcp-write');

    const operationHelp = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ops/publish-research.ts', '--help'], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, DATABASE_URL_POOLER: '' },
    });
    expect(operationHelp.status).toBe(0);
    expect(operationHelp.stdout).toContain('only governed research-publication mutation boundary');
  });

  it('marks unattended publication ineligible while preserving bounded preparation', () => {
    const interactive = inventoryEntry(
      'docs/agents/provider-adapters/interactive-inventory.json',
      'interactive-claude-finalize-for-upload',
    );
    const headless = inventoryEntry(
      'docs/agents/provider-adapters/headless-inventory.json',
      'headless-codex-finalize-for-upload',
    );
    expect(interactive).toMatchObject({
      source: { path: 'capabilities/research-publication/adapters/claude.md' },
      packaging: 'governed-provider-adapter',
      invocation: { unattended_eligibility: 'ineligible' },
      authority_and_write_scope: { writes: expect.stringContaining('main_claims') },
    });
    expect(headless).toMatchObject({
      source: { path: 'capabilities/research-publication/adapters/codex.md' },
      packaging: 'governed-provider-adapter',
      execution_contract: {
        class: 'bespoke',
        preamble_path: '.claude/skills/finalize-for-upload/HEADLESS_PREAMBLE.md',
      },
      invocation: { unattended_eligibility: 'ineligible' },
      authority_and_write_scope: { writes: expect.stringContaining('main_claims') },
    });
  });

  governanceIt('validates the exact package through the accepted public Workspace CLI', () => {
    const report = JSON.parse(spawnSync('./workspace', [
      'validate', 'capability', 'capabilities/research-publication',
      '--evidence-time', workspaceEvidenceTime, '--format', 'json',
    ], {
      cwd: process.cwd(), encoding: 'utf8',
      env: { ...process.env, WORKSPACE_REPOSITORY_ROOT: workspaceRoot },
    }).stdout) as { outcome: string; adapters: Array<{ state: string }> };
    expect(report.outcome).toBe('valid');
    expect(report.adapters.map(({ state }) => state)).toEqual(['current', 'current']);
  });
});
