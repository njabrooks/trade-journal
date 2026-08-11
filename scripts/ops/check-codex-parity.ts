#!/usr/bin/env tsx
/**
 * check-codex-parity — guard repository-owned Claude→Codex discovery surfaces.
 *
 * Repository authorities:
 *   1. INTERACTIVE inventory — docs/agents/provider-adapters/interactive-inventory.json.
 *   2. HEADLESS mirror — .agents/skills/ (generated from .claude/skills/).
 *
 * The optional ~/.codex/skills/trade-journal-workflows bridge is machine-local
 * bootstrap. It is deliberately not read or gated here: external bytes cannot be a
 * repository commit prerequisite or Adapter Conformance evidence.
 *
 * Usage:
 *   npx tsx scripts/ops/check-codex-parity.ts
 *   npx tsx scripts/ops/check-codex-parity.ts --json
 *   npx tsx scripts/ops/check-codex-parity.ts --nudge
 *   npx tsx scripts/ops/check-codex-parity.ts --discovery-only
 *
 * --bridge-only remains a compatibility alias for --discovery-only; it no longer
 * reads or validates the machine-local bridge.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from '../lib/skillBody.js';
import { validateInventory } from './validate-provider-adapter-inventory.js';

type JsonObject = Record<string, unknown>;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLAUDE_SKILLS_DIR = join(REPO_ROOT, '.claude', 'skills');
const AGENTS_SKILLS_DIR = join(REPO_ROOT, '.agents', 'skills');
const INTERACTIVE_INVENTORY = join(
  REPO_ROOT,
  'docs/agents/provider-adapters/interactive-inventory.json',
);
const DISCOVERY_ADAPTER = join(
  REPO_ROOT,
  'capabilities/workflow-discovery/adapters/codex.md',
);

function parseArgs(argv: string[]): Record<string, boolean> {
  const args: Record<string, boolean> = {};
  for (const value of argv) {
    if (value.startsWith('--')) args[value.slice(2)] = true;
  }
  return args;
}

function listSkills(): string[] {
  return readdirSync(CLAUDE_SKILLS_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(CLAUDE_SKILLS_DIR, entry.name, 'SKILL.md')),
    )
    .map((entry) => entry.name)
    .sort();
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function repositorySkillPaths(inventory: JsonObject): Set<string> {
  const paths = new Set<string>();
  const entries = Array.isArray(inventory.entries)
    ? inventory.entries.filter(isObject)
    : [];

  for (const entry of entries) {
    for (const field of ['source', 'migration_input'] as const) {
      const source = entry[field];
      if (
        isObject(source) &&
        source.location_class === 'repository' &&
        typeof source.path === 'string'
      ) {
        paths.add(source.path);
      }
    }
  }
  return paths;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(CLAUDE_SKILLS_DIR)) {
    console.error(`No .claude/skills/ at ${CLAUDE_SKILLS_DIR}.`);
    process.exit(1);
  }

  const skills = listSkills();
  const inventory = JSON.parse(read(INTERACTIVE_INVENTORY)) as JsonObject;
  const inventoryDiagnostics = validateInventory(inventory);
  const cataloguedPaths = repositorySkillPaths(inventory);
  const inventoryMissing = skills.filter(
    (skill) => !cataloguedPaths.has(`.claude/skills/${skill}/SKILL.md`),
  );
  const discoveryAdapterMissing = !existsSync(DISCOVERY_ADAPTER);
  const discoveryOk =
    inventoryDiagnostics.length === 0 &&
    inventoryMissing.length === 0 &&
    !discoveryAdapterMissing;

  const mirrorFound = existsSync(AGENTS_SKILLS_DIR);
  const mirrorMissing: string[] = [];
  const mirrorStale: string[] = [];
  if (mirrorFound) {
    for (const skill of skills) {
      const destination = join(AGENTS_SKILLS_DIR, skill);
      if (
        !existsSync(join(destination, 'skill.json')) ||
        !existsSync(join(destination, 'SKILL.md'))
      ) {
        mirrorMissing.push(skill);
        continue;
      }
      const expected = splitFrontmatter(
        read(join(CLAUDE_SKILLS_DIR, skill, 'SKILL.md')),
      ).body;
      if (read(join(destination, 'SKILL.md')) !== expected) {
        mirrorStale.push(skill);
      }
    }
  }
  const mirrorOk =
    !mirrorFound || (mirrorMissing.length === 0 && mirrorStale.length === 0);
  const ok = discoveryOk && mirrorOk;
  const discoveryOnly = Boolean(args['discovery-only'] || args['bridge-only']);
  const gatingOk = discoveryOnly ? discoveryOk : ok;

  if (args.nudge) {
    if (!ok) {
      const parts: string[] = [];
      const discoveryCount =
        inventoryDiagnostics.length +
        inventoryMissing.length +
        Number(discoveryAdapterMissing);
      const mirrorCount = mirrorMissing.length + mirrorStale.length;
      if (discoveryCount > 0) parts.push(`${discoveryCount} discovery`);
      if (mirrorCount > 0) parts.push(`${mirrorCount} mirror`);
      console.log(
        `[trade-journal] ⚠️ Codex skill drift (${parts.join(' · ')}) → npx tsx scripts/ops/check-codex-parity.ts`,
      );
    }
    process.exit(0);
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ok,
          source: { count: skills.length, skills },
          discovery: {
            inventory: 'docs/agents/provider-adapters/interactive-inventory.json',
            adapter: 'capabilities/workflow-discovery/adapters/codex.md',
            diagnostics: inventoryDiagnostics,
            missing: inventoryMissing,
            adapterMissing: discoveryAdapterMissing,
          },
          externalBridge: {
            authority: 'machine-local-environment-only',
            checked: false,
            gating: false,
          },
          mirror: mirrorFound
            ? { missing: mirrorMissing, stale: mirrorStale }
            : null,
          discoveryOnly,
          bridgeOnlyAliasUsed: Boolean(args['bridge-only']),
          gatingOk,
        },
        null,
        2,
      ),
    );
    process.exit(gatingOk ? 0 : 1);
  }

  console.log('\n=== Codex ↔ Claude workflow parity ===');
  console.log(`Source: ${skills.length} skills in .claude/skills/\n`);
  if (discoveryOk) {
    console.log(
      `repository discovery ........ ✅ ${skills.length}/${skills.length} skills catalogued; governed adapter present`,
    );
  } else {
    console.log(
      `repository discovery ........ ❌ ${inventoryDiagnostics.length} inventory diagnostic(s), ${inventoryMissing.length} missing skill(s), adapter ${discoveryAdapterMissing ? 'missing' : 'present'}`,
    );
  }
  console.log('machine-local bridge ....... ℹ️  active legacy router (not checked; never gating)');

  if (!mirrorFound) {
    console.log('.agents/ mirror ............ ⊘ not present (skipped)');
  } else if (mirrorOk) {
    console.log(`.agents/ mirror ............ ✅ ${skills.length}/${skills.length} current`);
  } else {
    const details: string[] = [];
    if (mirrorMissing.length > 0) {
      details.push(`${mirrorMissing.length} missing: ${mirrorMissing.join(', ')}`);
    }
    if (mirrorStale.length > 0) {
      details.push(`${mirrorStale.length} stale: ${mirrorStale.join(', ')}`);
    }
    console.log(
      `.agents/ mirror ............ ${discoveryOnly ? '⚠️' : '❌'} ${details.join('; ')}${discoveryOnly ? ' (warning — not gated)' : ''}`,
    );
  }

  if (gatingOk) {
    console.log(
      discoveryOnly && !mirrorOk
        ? '\n✅ Repository discovery is valid; mirror drift is non-gating in discovery-only mode.'
        : '\n✅ In sync — no gating drift.',
    );
  } else {
    console.log('\n✗ Drift detected:');
    for (const item of inventoryDiagnostics) {
      console.log(`   - ${item.requirement} ${item.path}: ${item.message}`);
    }
    if (inventoryMissing.length > 0) {
      console.log(
        `   - add repository inventory coverage for: ${inventoryMissing.join(', ')}`,
      );
    }
    if (discoveryAdapterMissing) {
      console.log('   - restore the governed workflow-discovery Codex adapter');
    }
    if (!discoveryOnly && (mirrorMissing.length > 0 || mirrorStale.length > 0)) {
      console.log('   - regenerate the mirror: npx tsx scripts/ops/generate-agents-mirror.ts');
    }
  }
  process.exit(gatingOk ? 0 : 1);
}

main();
