import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateInventory } from '../scripts/ops/validate-provider-adapter-inventory';

const inventoryPath = resolve(
  process.cwd(),
  'docs/agents/provider-adapters/interactive-inventory.json',
);

function readInventory(): Record<string, unknown> {
  return JSON.parse(readFileSync(inventoryPath, 'utf8')) as Record<string, unknown>;
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
    const evidence = entries[0].evidence as Record<string, unknown>;
    evidence.state = 'current';

    expect(validateInventory(inventory)).toContainEqual({
      requirement: 'TJ-INV-010',
      path: '/entries/0/evidence',
      message: 'current evidence requires exact version and digests.',
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
});
