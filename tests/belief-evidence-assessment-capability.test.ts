import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const capabilityRoot = resolve(
  process.cwd(),
  'capabilities/belief-evidence-assessment',
);
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

describe('belief-evidence-assessment Capability', () => {
  it('depends on governed thesis underwriting and binds the exact assessment target', () => {
    const capabilityPackage = readJson('capability-package.json');
    expect(capabilityPackage.dependencies).toEqual([{
      id: 'capability:scope:trade-journal/thesis-underwriting',
      version_constraint: '>=1.0.0 <2.0.0',
    }]);
    const contract = String(capabilityPackage.contract);
    expect(contract).toContain('latest versioned thesis articulation');
    expect(contract).toContain('complete active, thesis-linked, auto-derived resolution-signal set');
    expect(contract).toContain('articulationId');
    expect(contract).toContain('articulationVersion');
    expect(contract).toContain('signalIds');
  });

  it('binds both exact adapters to current complete evidence', () => {
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

  it('routes every mutation through the deterministic recorder and refuses broader authority', () => {
    for (const provider of ['claude', 'codex']) {
      const adapter = read(`adapters/${provider}.md`);
      const lowerAdapter = adapter.toLowerCase();
      expect(adapter).toContain('record-belief-evidence-assessment.ts --target');
      expect(adapter).toContain('record-belief-evidence-assessment.ts --stdin');
      expect(adapter).toContain('analysis is read-only');
      expect(adapter).toContain('direct semantic bearing');
      expect(adapter).toContain('full linked claims and observations with Toulmin fields and source content');
      expect(adapter).toContain('prior signal evidence');
      expect(adapter).toContain('conditionEffect');
      expect(adapter).toContain('The recorder rejects mismatched pairs');
      expect(lowerAdapter).toContain('ticker or keyword overlap');
      expect(adapter).toContain('must not create a claim');
      expect(adapter).toContain('must not invoke `scripts/ops/update-entity-status.ts`');
      expect(adapter).toContain('must not invoke `scripts/ops/resolve-decision.ts`');
      expect(adapter).toContain('must not create or configure a signal');
      expect(adapter).toContain('must not use ad-hoc SQL or Drizzle writes');
      expect(adapter).not.toContain('scripts/ops/add-journal-note.ts');
    }
  });

  governanceIt('validates the package and governed projections through the public Workspace CLI', () => {
    const environment = { ...process.env, WORKSPACE_REPOSITORY_ROOT: workspaceRoot };
    const capabilityReport = JSON.parse(execFileSync(
      './workspace',
      [
        'validate',
        'capability',
        'capabilities/belief-evidence-assessment',
        '--evidence-time',
        workspaceEvidenceTime,
        '--format',
        'json',
      ],
      { cwd: process.cwd(), encoding: 'utf8', env: environment },
    )) as { outcome: string; adapters: Array<{ state: string }> };
    const entryPointReport = JSON.parse(execFileSync(
      './workspace',
      [
        'validate',
        'provider-entry-points',
        '.',
        '--registry',
        'capability-registry.json',
        '--lock',
        'capability-registry-lock.json',
        '--mode',
        'published',
        '--evidence-time',
        workspaceEvidenceTime,
        '--format',
        'json',
      ],
      { cwd: process.cwd(), encoding: 'utf8', env: environment },
    )) as { outcome: string; outputs: Array<{ provider: string }> };

    expect(capabilityReport.outcome).toBe('valid');
    expect(capabilityReport.adapters.map(({ state }) => state)).toEqual(['current', 'current']);
    expect(entryPointReport.outcome).toBe('valid');
    expect(entryPointReport.outputs.map(({ provider }) => provider)).toEqual(['claude', 'codex']);
  });
});
