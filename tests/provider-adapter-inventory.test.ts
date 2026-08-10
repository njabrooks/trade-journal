import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateInventory } from '../scripts/ops/validate-provider-adapter-inventory';

const inventoryPath = resolve(
  process.cwd(),
  'docs/agents/provider-adapters/interactive-inventory.json',
);
const headlessInventoryPath = resolve(
  process.cwd(),
  'docs/agents/provider-adapters/headless-inventory.json',
);
const marketResearchDispositionPath = resolve(
  process.cwd(),
  'evidence/issue-70-market-research-scan-disposition.json',
);

function readInventory(): Record<string, unknown> {
  return JSON.parse(readFileSync(inventoryPath, 'utf8')) as Record<string, unknown>;
}

function readHeadlessInventory(): Record<string, unknown> {
  return JSON.parse(readFileSync(headlessInventoryPath, 'utf8')) as Record<string, unknown>;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(process.cwd(), path))).digest('hex');
}

describe('Provider Adapter inventory validation', () => {
  it('accepts the checked-in exhaustive interactive inventory', () => {
    expect(validateInventory(readInventory())).toEqual([]);
  });

  it('reports a stable coverage diagnostic when a Claude source is omitted', () => {
    const inventory = readInventory();
    inventory.entries = (inventory.entries as Array<Record<string, unknown>>).slice(1);

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-INV-012',
      path: '/entries',
      message:
        'Missing interactive Claude sources: .claude/skills/advance-or-kill/SKILL.md.',
    });
  });

  it('does not accept current evidence without exact binding fields', () => {
    const inventory = readInventory();
    const entries = inventory.entries as Array<Record<string, unknown>>;
    const index = entries.findIndex((entry) => (
      (entry.evidence as Record<string, unknown>).state === 'unavailable'
    ));
    const evidence = entries[index].evidence as Record<string, unknown>;
    evidence.state = 'current';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-INV-010',
      path: `/entries/${index}/evidence`,
      message: 'current evidence requires exact version and digests.',
    });
  });

  it('rejects a current adapter digest that drifts from its governed source', () => {
    const inventory = readInventory();
    const entries = inventory.entries as Array<Record<string, unknown>>;
    const portfolio = entries.find(
      (entry) => entry.id === 'interactive-claude-pull-portfolio',
    );
    const evidence = portfolio?.evidence as Record<string, unknown>;
    evidence.adapter_digest = 'sha256:drifted';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-INV-016',
      path: `/entries/${entries.indexOf(portfolio!)}/governed_binding`,
      message:
        'Governed binding must match the exact Capability Package, Provider Adapter, evidence record, and digests.',
    });
  });

  it('rejects a federated adapter digest that drifts from its immutable source revision', () => {
    const inventory = readInventory();
    const entries = inventory.entries as Array<Record<string, unknown>>;
    const processNote = entries.find(
      (entry) => entry.id === 'interactive-claude-process-note',
    );
    const evidence = processNote?.evidence as Record<string, unknown>;
    evidence.adapter_digest = 'sha256:drifted';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-INV-017',
      path: `/entries/${entries.indexOf(processNote!)}/federated_binding`,
      message:
        'Federated binding must resolve the exact Registry/Lock Capability Package, Provider Adapter, evidence record, dependencies, revision, and digests.',
    });
  });

  it('rejects federated ownership metadata that drifts from the Registry authority', () => {
    const inventory = readInventory();
    const entries = inventory.entries as Array<Record<string, unknown>>;
    const processNote = entries.find(
      (entry) => entry.id === 'interactive-claude-process-note',
    );
    const source = processNote?.source as Record<string, unknown>;
    source.ownership = 'repository:attacker/fake';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-INV-017',
      path: `/entries/${entries.indexOf(processNote!)}/federated_binding`,
      message:
        'Federated binding must resolve the exact Registry/Lock Capability Package, Provider Adapter, evidence record, dependencies, revision, and digests.',
    });
  });

  it('rejects a fabricated federated evidence date', () => {
    const inventory = readInventory();
    const entries = inventory.entries as Array<Record<string, unknown>>;
    const processNote = entries.find(
      (entry) => entry.id === 'interactive-claude-process-note',
    );
    const evidence = processNote?.evidence as Record<string, unknown>;
    evidence.as_of = '2099-01-01';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-INV-017',
      path: `/entries/${entries.indexOf(processNote!)}/federated_binding`,
      message:
        'Federated binding must resolve the exact Registry/Lock Capability Package, Provider Adapter, evidence record, dependencies, revision, and digests.',
    });
  });

  it('rejects unknown categorical values that could bypass source validation', () => {
    const inventory = readInventory();
    const entries = inventory.entries as Array<Record<string, unknown>>;
    const source = entries[0].source as Record<string, unknown>;
    source.location_class = 'elsewhere';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-INV-005',
      path: '/entries/0/source/location_class',
      message: 'Unknown source location_class.',
    });
  });

  it('enforces the interactive invocation boundary', () => {
    const inventory = readInventory();
    const entries = inventory.entries as Array<Record<string, unknown>>;
    const invocation = entries[0].invocation as Record<string, unknown>;
    invocation.mode = 'scheduled';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-INV-006',
      path: '/entries/0/invocation/mode',
      message: 'Interactive inventory entries must use interactive invocation mode.',
    });
  });

  it('rejects dangling tool-mapping entry references', () => {
    const inventory = readInventory();
    const mappings = inventory.tool_mappings as Array<Record<string, unknown>>;
    mappings[0].affected_entries = ['interactive-claude-does-not-exist'];

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-INV-014',
      path: '/tool_mappings/0/affected_entries',
      message: 'Unknown affected inventory entry: interactive-claude-does-not-exist.',
    });
  });

  it('accepts the checked-in exhaustive headless inventory', () => {
    expect(validateInventory(readHeadlessInventory())).toEqual([]);
  });

  it('keeps the market research scan explicitly deferred without inventing operational support', () => {
    const interactive = readInventory();
    const headless = readHeadlessInventory();
    const interactiveEntry = (
      interactive.entries as Array<Record<string, unknown>>
    ).find((entry) => entry.id === 'interactive-claude-visser-scan')!;
    const headlessEntry = (
      headless.entries as Array<Record<string, unknown>>
    ).find((entry) => entry.id === 'headless-codex-visser-scan')!;
    const disposition = JSON.parse(
      readFileSync(marketResearchDispositionPath, 'utf8'),
    ) as Record<string, unknown>;

    expect(interactiveEntry.packaging).toBe('authored-provider-entry-point');
    expect(interactiveEntry.invocation).toMatchObject({
      mode: 'interactive',
      unattended_eligibility: 'ineligible',
    });
    expect(interactiveEntry.evidence).toMatchObject({
      state: 'unavailable',
      capability_version: null,
      package_digest: null,
      adapter_digest: null,
      reason:
        'File presence, mirror parity, and machine-local Notes data do not establish current Adapter Conformance.',
    });
    expect(interactiveEntry.j2_disposition).toEqual({
      action: 'defer',
      rationale:
        'Keep only the existing pull-only manual boundary as a non-governed migration input; do not route, schedule, or represent it as current support.',
    });

    expect(headlessEntry.invocation).toMatchObject({
      mode: 'headless',
      unattended_eligibility: 'ineligible',
    });
    expect(headlessEntry.execution_contract).toEqual({
      class: 'bespoke',
      preamble_path: '.claude/skills/visser-scan/HEADLESS_PREAMBLE.md',
      readiness:
        'Protective zero-write unavailable/refusal contract only; it is not execution or operational-readiness authority.',
    });
    expect(headlessEntry.operational_consumers).toEqual([
      'No live operational consumer; current repository automation does not invoke this Codex projection.',
    ]);
    expect(headlessEntry.evidence).toEqual(interactiveEntry.evidence);
    expect(headlessEntry.j2_disposition).toEqual(interactiveEntry.j2_disposition);

    expect(disposition).toMatchObject({
      kind: 'MarketResearchScanDisposition',
      issue: 'njabrooks/trade-journal#70',
      disposition: 'deferred-unavailable',
      governed_adapter_published: false,
      manual_consumer_present: true,
      live_operational_consumer_present: false,
      active_discovery_changed: false,
      notes_authority: 'repository:njabrooks/notes',
      trade_journal_authority: 'scope:trade-journal',
      notes_source: {
        latest_source_data_as_of: '2026-07-17',
        latest_source_data_was_stale_at_review: true,
        worktree_mutated: false,
      },
    });

    const migrationInputs = disposition.migration_inputs as Record<
      string,
      Record<string, unknown>
    >;
    for (const input of Object.values(migrationInputs)) {
      expect(input.sha256).toBe(sha256(String(input.path)));
      if (input.preamble_path) {
        expect(input.preamble_sha256).toBe(sha256(String(input.preamble_path)));
      }
      if (input.authored_preamble_path) {
        expect(input.authored_preamble_sha256).toBe(
          sha256(String(input.authored_preamble_path)),
        );
      }
    }
    expect(
      readFileSync(
        resolve(process.cwd(), '.agents/skills/visser-scan/HEADLESS_PREAMBLE.md'),
        'utf8',
      ),
    ).toContain(
      'Do not execute the Visser scan procedure, query Trade Journal, read Notes data, browse, or write anything.',
    );
  });

  it('reports a stable coverage diagnostic when a headless projection is omitted', () => {
    const inventory = readHeadlessInventory();
    inventory.entries = (inventory.entries as Array<Record<string, unknown>>).slice(1);

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-HEAD-006',
      path: '/entries',
      message: 'Missing headless projections: .agents/skills/advance-or-kill/SKILL.md.',
    });
  });

  it('rejects a generic classification for a bespoke contract', () => {
    const inventory = readHeadlessInventory();
    const entries = inventory.entries as Array<Record<string, unknown>>;
    const bespoke = entries.find((entry) => entry.id === 'headless-codex-build-core-argument');
    const contract = bespoke?.execution_contract as Record<string, unknown>;
    contract.class = 'generic';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-HEAD-004',
      path: `/entries/${entries.indexOf(bespoke!)}/execution_contract/class`,
      message: 'Contract class must be bespoke for build-core-argument.',
    });
  });

  it('keeps interactive-only workflows ineligible for unattended execution', () => {
    const inventory = readHeadlessInventory();
    const entries = inventory.entries as Array<Record<string, unknown>>;
    const thesis = entries.find((entry) => entry.id === 'headless-codex-thesis');
    const invocation = thesis?.invocation as Record<string, unknown>;
    invocation.unattended_eligibility = 'eligible';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-HEAD-008',
      path: `/entries/${entries.indexOf(thesis!)}/invocation/unattended_eligibility`,
      message: 'thesis must remain ineligible for unattended execution.',
    });
  });

  it('rejects a dangling scheduled-workflow adapter reference', () => {
    const inventory = readHeadlessInventory();
    const workflows = inventory.operational_workflows as Array<Record<string, unknown>>;
    workflows[0].migration_target_entry = 'headless-codex-does-not-exist';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-HEAD-010',
      path: '/operational_workflows/0/migration_target_entry',
      message: 'Unknown headless migration target: headless-codex-does-not-exist.',
    });
  });
});
