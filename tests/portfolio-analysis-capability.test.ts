import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const capabilityRoot = resolve(process.cwd(), 'capabilities/portfolio-analysis');
const fixturePath = resolve(process.cwd(), 'tests/fixtures/portfolio-analysis-adapter-equivalence.json');

function read(path: string): string {
  return readFileSync(resolve(capabilityRoot, path), 'utf8');
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

function digest(path: string): string {
  return `sha256:${createHash('sha256').update(read(path)).digest('hex')}`;
}

function normalizeAdapter(adapter: string): string {
  return adapter
    .replace(/^## (Claude|Codex) Provider Adapter\n\n/, '')
    .replace('Ask for missing required inputs in an interactive request.', 'Refuse a request with missing required inputs.')
    .replace('Refuse a headless request with missing required inputs.', 'Refuse a request with missing required inputs.')
    .replaceAll('exact Claude adapter', 'exact provider adapter')
    .replaceAll('exact Codex adapter', 'exact provider adapter');
}

describe('portfolio-analysis Capability', () => {
  it('composes only the two governed dependencies', () => {
    const capability = readJson('capability-package.json');
    expect(capability.id).toBe('capability:scope:trade-journal/portfolio-analysis');
    expect(capability.authority).toBe('scope:trade-journal');
    expect(capability.dependencies).toEqual([
      {
        id: 'capability:scope:trade-journal/portfolio-snapshot',
        version_constraint: '>=1.0.0 <2.0.0',
      },
      {
        id: 'capability:scope:trade-journal/options-vol-analysis',
        version_constraint: '>=1.0.0 <2.0.0',
      },
    ]);
  });

  it('keeps exact provider semantics equivalent apart from missing-input interaction', () => {
    const claude = read('adapters/claude.md');
    const codex = read('adapters/codex.md');
    expect(normalizeAdapter(claude)).toBe(normalizeAdapter(codex));

    for (const adapter of [claude, codex]) {
      expect(adapter).toContain('capability:scope:trade-journal/portfolio-snapshot');
      expect(adapter).toContain('capability:scope:trade-journal/options-vol-analysis');
      expect(adapter).toContain('from the immutable Registry Lock');
      expect(adapter).toContain('`persist: false`');
      expect(adapter).toContain('Preserve the complete snapshot result');
      expect(adapter).toContain('Preserve the complete result envelope and `AnalysisOutput`');
      expect(adapter).toContain('without recalculation, reordering, omission, or replacement');
      expect(adapter).toContain('exact JSON field path');
      expect(adapter).toContain('A valid snapshot plus any refused, unavailable, or failed options dependency is `partial`');
      expect(adapter).toContain('`writes` is always `[]`');
    }
  });

  it('binds equivalent observable analysis requirements to the exact adapters', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      limitation: string;
      dependencyResults: {
        portfolioSnapshot: Record<string, unknown>;
        optionsAnalyses: Array<Record<string, unknown>>;
      };
      observableRequirements: string[];
      expectedStatus: string;
      expectedWrites: unknown[];
    };

    expect(fixture.limitation).toContain('No live Claude or Codex provider invocation is claimed');
    expect(fixture.dependencyResults.portfolioSnapshot.snapshotDate).toBe('2026-08-11');
    expect(fixture.dependencyResults.optionsAnalyses).toHaveLength(1);
    expect(fixture.observableRequirements).toHaveLength(7);
    expect(fixture.expectedStatus).toBe('completed');
    expect(fixture.expectedWrites).toEqual([]);

    for (const adapter of ['claude', 'codex']) {
      const body = read(`adapters/${adapter}.md`);
      for (const field of [
        '`status`',
        '`focus`',
        '`portfolioSnapshot`',
        '`observations`',
        '`optionsAnalyses`',
        '`unavailableDependencies`',
        '`limitations`',
        '`errors`',
        '`writes`',
      ]) {
        expect(body).toContain(field);
      }
    }
  });

  it('preserves the read-only and unavailable-dependency boundary', () => {
    for (const provider of ['claude', 'codex']) {
      const adapter = read(`adapters/${provider}.md`);
      expect(adapter).toContain('This adapter is read-only.');
      expect(adapter).toContain('do not invoke options analysis');
      expect(adapter).toContain('Do not substitute connector data');
      expect(adapter).toContain('must not use Supabase MCP, Massive connector tooling, ad hoc SQL');
      expect(adapter).toContain('must not mutate portfolio, journal, thesis, claim, signal, strategy, position, Decision Item');
      expect(adapter).not.toMatch(/execute_sql|apply_migration|store_as=|query_data/);
      expect(adapter).not.toMatch(/scripts\/ibkr-option-quote\.py|scripts\/ibkr-quote-contracts\.py/);
    }
  });

  it('binds both exact adapters to complete current evidence', () => {
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
});
