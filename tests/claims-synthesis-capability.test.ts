import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateClaimsSynthesisResult } from '../src/lib/intelligence/claimsSynthesis.js';

const capabilityRoot = resolve(process.cwd(), 'capabilities/claims-synthesis');
const workspaceRoot = process.env.WORKSPACE_REPOSITORY_ROOT;
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

describe('claims-synthesis Capability', () => {
  it('publishes the exact provenance, distinction, ambiguity, and zero-write contract', () => {
    const capability = readJson('capability-package.json');
    expect(capability.id).toBe('capability:scope:trade-journal/claims-synthesis');
    expect(capability.authority).toBe('scope:trade-journal');
    expect(String(capability.contract)).toContain('Notes/Tana owns capture, source material, and Toulmin extraction');
    expect(String(capability.contract)).toContain('source evidence, existing main claims, synthesized investment claims, and proposed thesis mappings');
    expect(String(capability.contract)).toContain('recommendation-only');
    expect(capability.dependencies).toEqual([]);
  });

  it('keeps exact Claude and Codex adapter semantics equivalent and rejects stale legacy authority', () => {
    const adapters = ['claude', 'codex'].map((provider) => read(`adapters/${provider}.md`));
    const normalize = (adapter: string) => adapter
      .replace(/^## (Claude|Codex) Provider Adapter\n\n/, '')
      .replaceAll("Claude's repository command runner", 'the repository command runner')
      .replaceAll("Codex's repository command runner", 'the repository command runner');
    expect(normalize(adapters[0])).toBe(normalize(adapters[1]));

    for (const adapter of adapters) {
      const lowerAdapter = adapter.toLowerCase();
      expect(adapter).toContain('scripts/claims-synthesis.ts --prepare');
      expect(adapter).toContain('scripts/claims-synthesis.ts --validate-result');
      expect(adapter).toContain('Notes/Tana owns capture, source material, and Toulmin extraction');
      expect(adapter).toContain('`(sourceInsightId, sourceClaimId)` provenance');
      expect(adapter).toContain('developing and monitoring');
      expect(lowerAdapter).toContain('ticker and keyword overlap are retrieval hints only');
      expect(adapter).toContain('recommendation-only');
      expect(adapter).toContain('must not invoke `scripts/ops/create-claim.ts`');
      expect(adapter).toContain('`scripts/ops/link-claim-to-thesis.ts`');
      expect(adapter).toContain('`scripts/ops/update-entity-status.ts`');
      expect(adapter).toContain('`scripts/ops/resolve-decision.ts`');
      expect(adapter).toContain('must not use ad-hoc SQL, Supabase MCP writes, or direct API mutation');
      expect(adapter).toContain('strategy, position, or trade authority');
      expect(adapter).not.toContain('Obsidian');
      expect(adapter).not.toContain('/api/research/promote-claim');
    }
  });

  it('binds representative equivalent output to the exact adapter bytes without claiming live invocation', () => {
    const fixture = readJson('../../tests/fixtures/claims-synthesis-adapter-equivalence.json') as {
      limitation: string;
      context: Parameters<typeof validateClaimsSynthesisResult>[0];
      output: Parameters<typeof validateClaimsSynthesisResult>[1];
      providers: Record<'claude' | 'codex', {
        adapterDigest: string;
      }>;
    };
    expect(fixture.limitation).toContain('No live provider invocation');
    const outcomes = (['claude', 'codex'] as const).map((provider) => {
      expect(fixture.providers[provider].adapterDigest).toBe(digest(`adapters/${provider}.md`));
      return validateClaimsSynthesisResult(fixture.context, fixture.output);
    });
    expect(outcomes[0]).toEqual(outcomes[1]);
  });

  it('refuses cross-wired claim mappings and incomplete per-source recommendations', () => {
    const fixture = readJson('../../tests/fixtures/claims-synthesis-adapter-equivalence.json') as {
      context: Parameters<typeof validateClaimsSynthesisResult>[0];
      output: Record<string, unknown> & {
        thesisMappings: Array<Record<string, unknown>>;
        recommendations: Array<Record<string, unknown>>;
      };
    };
    expect(() => validateClaimsSynthesisResult(fixture.context, {
      ...fixture.output,
      thesisMappings: fixture.output.thesisMappings.map((mapping, index) =>
        index === 0 ? { ...mapping, sourceClaimId: 'claim-2' } : mapping),
    })).toThrow(/same source claim/i);
    expect(() => validateClaimsSynthesisResult(fixture.context, {
      ...fixture.output,
      recommendations: fixture.output.recommendations.slice(0, 2),
    })).toThrow(/every source claim exactly once/i);
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

  governanceIt('validates the exact package through the accepted public Workspace CLI', () => {
    const report = JSON.parse(execFileSync('./workspace', [
      'validate',
      'capability',
      'capabilities/claims-synthesis',
      '--evidence-time',
      '2026-08-08',
      '--format',
      'json',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, WORKSPACE_REPOSITORY_ROOT: workspaceRoot },
    })) as { outcome: string; adapters: Array<{ state: string }> };

    expect(report.outcome).toBe('valid');
    expect(report.adapters.map(({ state }) => state)).toEqual(['current', 'current']);
  });
});
