import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type InventoryEntry = {
  id: string;
  candidate_capability: { status: string };
  source: { path: string };
  packaging: string;
  invocation: { unattended_eligibility: string };
  lifecycle: { status: string; protective_tombstone: boolean };
  authority_and_write_scope: { reads: string; writes: string };
  operational_consumers: string[];
  evidence: {
    state: string;
    capability_version: string | null;
    package_digest: string | null;
    adapter_digest: string | null;
  };
  j2_disposition: { action: string; rationale: string };
  execution_contract?: { class: string; preamble_path: string; readiness: string };
  authored_source?: { path: string };
};

const expectedIds = [
  'headless-codex-archived-deep-dive',
  'headless-codex-archived-generate-summary',
  'headless-codex-configure-signal',
  'headless-codex-paperclip-backlog',
  'interactive-claude-archived-deep-dive',
  'interactive-claude-archived-generate-summary',
  'interactive-claude-configure-signal',
  'interactive-claude-paperclip-backlog',
];

function readEntries(kind: 'interactive' | 'headless'): InventoryEntry[] {
  const inventory = JSON.parse(
    readFileSync(
      resolve(process.cwd(), `docs/agents/provider-adapters/${kind}-inventory.json`),
      'utf8',
    ),
  ) as { entries: InventoryEntry[] };
  return inventory.entries.filter(
    (entry) => entry.candidate_capability.status === 'not-candidate',
  );
}

function sha256(path: string): string {
  return createHash('sha256')
    .update(readFileSync(resolve(process.cwd(), path)))
    .digest('hex');
}

describe('issue #75 non-candidate entry-point dispositions', () => {
  const entries = [...readEntries('interactive'), ...readEntries('headless')];

  it('reconciles exactly the eight inventoried non-candidates', () => {
    expect(entries.map((entry) => entry.id).sort()).toEqual(expectedIds);
    expect(entries).toHaveLength(8);

    for (const entry of entries) {
      expect(entry.invocation.unattended_eligibility).toBe('ineligible');
      expect(entry.evidence).toMatchObject({
        state: 'unavailable',
        capability_version: null,
        package_digest: null,
        adapter_digest: null,
      });
      expect(entry.j2_disposition.action).toBe('retire');
    }
  });

  it('moves obsolete archived and deprecated procedures out of active discovery', () => {
    const historical = entries.filter((entry) => !entry.lifecycle.protective_tombstone);
    expect(historical).toHaveLength(6);

    for (const entry of historical) {
      expect(entry.packaging).toBe('historical-evidence');
      expect(entry.source.path).toMatch(
        /^docs\/archive\/provider-adapters\/issue-75\/(claude|codex)\//,
      );
      expect(existsSync(resolve(process.cwd(), entry.source.path))).toBe(true);
      expect(entry.authority_and_write_scope).toEqual(
        expect.objectContaining({
          reads: 'Historical evidence only; not an executable workflow.',
          writes: 'No writes permitted.',
        }),
      );
      expect(entry.operational_consumers).toEqual(['None; historical evidence only.']);
      if (entry.authored_source) {
        expect(entry.authored_source.path).toMatch(
          /^docs\/archive\/provider-adapters\/issue-75\/claude\//,
        );
      }
    }

    for (const name of [
      'archived-deep-dive',
      'archived-generate-summary',
      'paperclip-backlog',
    ]) {
      expect(existsSync(resolve(process.cwd(), `.claude/skills/${name}`))).toBe(false);
      expect(existsSync(resolve(process.cwd(), `.agents/skills/${name}`))).toBe(false);
    }
  });

  it('excludes every non-candidate from operational mappings and current coverage claims', () => {
    const interactive = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'docs/agents/provider-adapters/interactive-inventory.json',
        ),
        'utf8',
      ),
    ) as {
      entries: InventoryEntry[];
      discovery_surfaces: Array<{ id: string; coverage: string }>;
      tool_mappings: Array<{ affected_entries: string[] }>;
      known_gaps: Array<{ id: string; detail: string }>;
    };
    const headless = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'docs/agents/provider-adapters/headless-inventory.json',
        ),
        'utf8',
      ),
    ) as {
      entries: InventoryEntry[];
      known_gaps: Array<{ id: string; detail: string }>;
    };
    const nonCandidateIds = new Set(entries.map((entry) => entry.id));

    for (const mapping of interactive.tool_mappings) {
      for (const affectedEntry of mapping.affected_entries) {
        expect(nonCandidateIds.has(affectedEntry)).toBe(false);
      }
    }
    expect(
      interactive.discovery_surfaces.find(
        (surface) => surface.id === 'codex-exhaustive-inventory',
      )?.coverage,
    ).toContain('33 repository Claude discovery sources plus three issue #75 historical-only records');
    expect(
      headless.known_gaps.find((gap) => gap.id === 'generic-contract-readiness')
        ?.detail,
    ).toContain('Fourteen current projections have generic packaging baselines');
    expect(
      interactive.known_gaps.find((gap) => gap.id === 'no-exact-adapter-evidence')
        ?.detail,
    ).toContain(
      'Twenty-four interactive inventory entries have current evidence. Of thirteen unavailable entries, nine await J2 disposition and four non-candidates have completed final retire dispositions',
    );
    expect(
      interactive.known_gaps.find((gap) => gap.id === 'no-exact-adapter-evidence')
        ?.detail,
    ).toContain(
      'After issue #71 adds two governed discovery adapters, the current totals are twenty-six current and twelve unavailable; the same four non-candidate dispositions remain unchanged.',
    );
    expect(
      headless.known_gaps.find((gap) => gap.id === 'adapter-evidence-unavailable')
        ?.detail,
    ).toContain(
      'Twenty-four headless inventory entries have current evidence. Of twelve unavailable entries, eight await J2 disposition and four non-candidates have completed final retire dispositions',
    );
    expect(
      interactive.entries.filter((entry) => entry.evidence.state === 'current'),
    ).toHaveLength(26);
    expect(
      interactive.entries.filter((entry) => entry.evidence.state === 'unavailable'),
    ).toHaveLength(12);
    expect(
      headless.entries.filter((entry) => entry.evidence.state === 'current'),
    ).toHaveLength(24);
    expect(
      headless.entries.filter((entry) => entry.evidence.state === 'unavailable'),
    ).toHaveLength(12);
  });

  it('keeps configure-signal only as an exact no-read/no-write protective tombstone', () => {
    const tombstones = entries.filter((entry) => entry.lifecycle.protective_tombstone);
    expect(tombstones).toHaveLength(2);

    for (const entry of tombstones) {
      expect(entry.packaging).toBe('protective-tombstone');
      expect(entry.lifecycle.status).toBe('tombstone');
      expect(entry.authority_and_write_scope).toEqual(
        expect.objectContaining({
          reads: 'Retirement notice only; no data access permitted.',
          writes: 'No writes permitted.',
        }),
      );
      expect(entry.operational_consumers).toEqual([
        'Safety boundary only; no operational consumer.',
      ]);
    }

    const claudeSkill = readFileSync(
      resolve(process.cwd(), '.claude/skills/configure-signal/SKILL.md'),
      'utf8',
    );
    const codexSkill = readFileSync(
      resolve(process.cwd(), '.agents/skills/configure-signal/SKILL.md'),
      'utf8',
    );
    const claudePreamble = readFileSync(
      resolve(process.cwd(), '.claude/skills/configure-signal/HEADLESS_PREAMBLE.md'),
      'utf8',
    );
    const codexPreamble = readFileSync(
      resolve(process.cwd(), '.agents/skills/configure-signal/HEADLESS_PREAMBLE.md'),
      'utf8',
    );

    for (const text of [claudeSkill, codexSkill, claudePreamble, codexPreamble]) {
      expect(text).toContain('Do not read data, browse, call a provider, or write anything.');
      expect(text).toMatch(/"?writes"?: \[\]/);
      expect(text).not.toContain('Step 1 — LOAD');
      expect(text).not.toMatch(/\bpsql\b|\bcurl\b|UPDATE signals/i);
    }
    expect(codexPreamble).toBe(claudePreamble);

    const headless = tombstones.find((entry) => entry.id.startsWith('headless-'))!;
    expect(headless.execution_contract).toEqual({
      class: 'bespoke',
      preamble_path: '.claude/skills/configure-signal/HEADLESS_PREAMBLE.md',
      readiness:
        'Protective no-read/no-write refusal contract only; it is not an operational adapter.',
    });
  });

  it('binds every archived and protective byte to the issue receipt', () => {
    const receipt = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'evidence/issue-75-non-candidate-dispositions.json'),
        'utf8',
      ),
    ) as {
      inventory_entries_reconciled: number;
      archived_bytes: Array<{ path: string; sha256: string }>;
      protective_tombstone_bytes: Record<string, { path: string; sha256: string }>;
    };

    expect(receipt.inventory_entries_reconciled).toBe(8);
    expect(receipt.archived_bytes).toHaveLength(14);
    for (const artifact of [
      ...receipt.archived_bytes,
      ...Object.values(receipt.protective_tombstone_bytes),
    ]) {
      expect(sha256(artifact.path)).toBe(artifact.sha256);
    }
  });
});
