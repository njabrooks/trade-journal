#!/usr/bin/env tsx

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Diagnostic = {
  requirement: string;
  path: string;
  message: string;
};

type JsonObject = Record<string, unknown>;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_INVENTORY = join(
  REPO_ROOT,
  'docs/agents/provider-adapters/interactive-inventory.json',
);
const ACCEPTED_WORKSPACE_REVISION = '2b6ea3e02ff5ba114b0f91dd779c4afb26181358';
const EVIDENCE_STATES = new Set([
  'current',
  'stale',
  'partial',
  'experimental',
  'deprecated',
  'unavailable',
]);
const LIFECYCLES = new Set([
  'active',
  'archived',
  'retired',
  'deprecated',
  'tombstone',
]);
const DISPOSITIONS = new Set([
  'migrate',
  'retain-temporarily',
  'retire',
  'replace',
  'defer',
]);
const UNATTENDED_STATES = new Set(['eligible', 'conditional', 'ineligible']);
const PROVIDERS = new Set(['claude', 'codex']);
const PACKAGING = new Set([
  'authored-provider-entry-point',
  'external-interactive-bridge',
  'generated-headless-projection',
]);
const LOCATION_CLASSES = new Set(['repository', 'external-bridge']);
const INVOCATION_MODES = new Set(['interactive', 'headless', 'scheduled']);
const OWNERSHIP_PREFIXES = ['repository:', 'machine-local:', 'workspace:', 'external:'];

function diagnostic(requirement: string, path: string, message: string): Diagnostic {
  return { requirement, path, message };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonempty);
}

function safeRepositoryPath(value: string): boolean {
  if (isAbsolute(value)) return false;
  const target = resolve(REPO_ROOT, value);
  return target === REPO_ROOT || target.startsWith(`${REPO_ROOT}/`);
}

function exactFields(
  value: JsonObject,
  expected: string[],
  path: string,
  requirement: string,
  diagnostics: Diagnostic[],
) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    diagnostics.push(
      diagnostic(
        requirement,
        path,
        `Fields must be exactly: ${wanted.join(', ')}.`,
      ),
    );
  }
}

function requireStrings(
  value: JsonObject,
  fields: string[],
  path: string,
  requirement: string,
  diagnostics: Diagnostic[],
) {
  for (const field of fields) {
    if (!nonempty(value[field])) {
      diagnostics.push(
        diagnostic(requirement, `${path}/${field}`, `${field} must be a non-empty string.`),
      );
    }
  }
}

function validateCandidate(value: unknown, path: string, diagnostics: Diagnostic[]) {
  if (!isObject(value)) {
    diagnostics.push(diagnostic('TJ-INV-004', path, 'candidate_capability must be an object.'));
    return;
  }
  const status = value.status;
  if (status === 'candidate') {
    exactFields(value, ['status', 'id', 'authority'], path, 'TJ-INV-004', diagnostics);
    requireStrings(value, ['id', 'authority'], path, 'TJ-INV-004', diagnostics);
    if (nonempty(value.id) && !value.id.startsWith('capability:')) {
      diagnostics.push(
        diagnostic('TJ-INV-004', `${path}/id`, 'Candidate Capability id must start with capability:.'),
      );
    }
  } else if (status === 'not-candidate') {
    exactFields(value, ['status', 'reason'], path, 'TJ-INV-004', diagnostics);
    requireStrings(value, ['reason'], path, 'TJ-INV-004', diagnostics);
  } else {
    diagnostics.push(
      diagnostic('TJ-INV-004', `${path}/status`, 'status must be candidate or not-candidate.'),
    );
  }
}

function validateEntry(value: unknown, index: number, diagnostics: Diagnostic[]) {
  const path = `/entries/${index}`;
  if (!isObject(value)) {
    diagnostics.push(diagnostic('TJ-INV-003', path, 'Inventory entry must be an object.'));
    return;
  }
  exactFields(
    value,
    [
      'id',
      'ability',
      'candidate_capability',
      'provider',
      'source',
      'packaging',
      'invocation',
      'lifecycle',
      'authority_and_write_scope',
      'prerequisites',
      'limitations',
      'operational_consumers',
      'evidence',
      'j2_disposition',
    ],
    path,
    'TJ-INV-003',
    diagnostics,
  );
  requireStrings(value, ['id', 'ability', 'provider', 'packaging'], path, 'TJ-INV-003', diagnostics);
  if (nonempty(value.provider) && !PROVIDERS.has(value.provider)) {
    diagnostics.push(diagnostic('TJ-INV-003', `${path}/provider`, 'Unknown provider.'));
  }
  if (nonempty(value.packaging) && !PACKAGING.has(value.packaging)) {
    diagnostics.push(diagnostic('TJ-INV-003', `${path}/packaging`, 'Unknown packaging class.'));
  }
  validateCandidate(value.candidate_capability, `${path}/candidate_capability`, diagnostics);

  const source = value.source;
  if (!isObject(source)) {
    diagnostics.push(diagnostic('TJ-INV-005', `${path}/source`, 'source must be an object.'));
  } else {
    exactFields(source, ['ownership', 'location_class', 'path'], `${path}/source`, 'TJ-INV-005', diagnostics);
    requireStrings(source, ['ownership', 'location_class', 'path'], `${path}/source`, 'TJ-INV-005', diagnostics);
    if (nonempty(source.location_class) && !LOCATION_CLASSES.has(source.location_class)) {
      diagnostics.push(
        diagnostic('TJ-INV-005', `${path}/source/location_class`, 'Unknown source location_class.'),
      );
    }
    const sourceOwnership = source.ownership;
    if (
      nonempty(sourceOwnership) &&
      !OWNERSHIP_PREFIXES.some((prefix) => sourceOwnership.startsWith(prefix))
    ) {
      diagnostics.push(
        diagnostic('TJ-INV-005', `${path}/source/ownership`, 'Unknown source ownership authority class.'),
      );
    }
    if (source.location_class === 'repository' && nonempty(source.path)) {
      if (!safeRepositoryPath(source.path)) {
        diagnostics.push(
          diagnostic('TJ-INV-005', `${path}/source/path`, 'Repository source must be a safe relative path.'),
        );
      } else if (!existsSync(join(REPO_ROOT, source.path))) {
        diagnostics.push(
          diagnostic('TJ-INV-005', `${path}/source/path`, 'Repository source path does not exist.'),
        );
      }
    }
    if (
      value.packaging === 'authored-provider-entry-point' &&
      source.location_class !== 'repository'
    ) {
      diagnostics.push(
        diagnostic(
          'TJ-INV-005',
          `${path}/source/location_class`,
          'Authored repository entry points must use repository source locations.',
        ),
      );
    }
    if (
      value.packaging === 'external-interactive-bridge' &&
      source.location_class !== 'external-bridge'
    ) {
      diagnostics.push(
        diagnostic(
          'TJ-INV-005',
          `${path}/source/location_class`,
          'External interactive bridges must use external-bridge source locations.',
        ),
      );
    }
  }

  const invocation = value.invocation;
  if (!isObject(invocation)) {
    diagnostics.push(diagnostic('TJ-INV-006', `${path}/invocation`, 'invocation must be an object.'));
  } else {
    exactFields(
      invocation,
      ['mode', 'entry_point', 'unattended_eligibility', 'rationale'],
      `${path}/invocation`,
      'TJ-INV-006',
      diagnostics,
    );
    requireStrings(
      invocation,
      ['mode', 'entry_point', 'unattended_eligibility', 'rationale'],
      `${path}/invocation`,
      'TJ-INV-006',
      diagnostics,
    );
    if (nonempty(invocation.mode) && !INVOCATION_MODES.has(invocation.mode)) {
      diagnostics.push(
        diagnostic('TJ-INV-006', `${path}/invocation/mode`, 'Unknown invocation mode.'),
      );
    }
    if (
      nonempty(invocation.unattended_eligibility) &&
      !UNATTENDED_STATES.has(invocation.unattended_eligibility)
    ) {
      diagnostics.push(
        diagnostic(
          'TJ-INV-006',
          `${path}/invocation/unattended_eligibility`,
          'unattended_eligibility must be eligible, conditional, or ineligible.',
        ),
      );
    }
    if (invocation.mode !== 'interactive') {
      diagnostics.push(
        diagnostic(
          'TJ-INV-006',
          `${path}/invocation/mode`,
          'Interactive inventory entries must use interactive invocation mode.',
        ),
      );
    }
  }

  const lifecycle = value.lifecycle;
  if (!isObject(lifecycle)) {
    diagnostics.push(diagnostic('TJ-INV-007', `${path}/lifecycle`, 'lifecycle must be an object.'));
  } else {
    exactFields(lifecycle, ['status', 'protective_tombstone'], `${path}/lifecycle`, 'TJ-INV-007', diagnostics);
    if (!nonempty(lifecycle.status) || !LIFECYCLES.has(lifecycle.status)) {
      diagnostics.push(
        diagnostic('TJ-INV-007', `${path}/lifecycle/status`, 'Unknown lifecycle status.'),
      );
    }
    if (typeof lifecycle.protective_tombstone !== 'boolean') {
      diagnostics.push(
        diagnostic(
          'TJ-INV-007',
          `${path}/lifecycle/protective_tombstone`,
          'protective_tombstone must be boolean.',
        ),
      );
    }
  }

  const scope = value.authority_and_write_scope;
  if (!isObject(scope)) {
    diagnostics.push(
      diagnostic('TJ-INV-008', `${path}/authority_and_write_scope`, 'authority_and_write_scope must be an object.'),
    );
  } else {
    exactFields(scope, ['reads', 'writes', 'judgment'], `${path}/authority_and_write_scope`, 'TJ-INV-008', diagnostics);
    requireStrings(scope, ['reads', 'writes', 'judgment'], `${path}/authority_and_write_scope`, 'TJ-INV-008', diagnostics);
  }

  for (const field of ['prerequisites', 'limitations', 'operational_consumers']) {
    if (!stringArray(value[field])) {
      diagnostics.push(
        diagnostic('TJ-INV-009', `${path}/${field}`, `${field} must be a non-empty string array.`),
      );
    }
  }

  const evidence = value.evidence;
  if (!isObject(evidence)) {
    diagnostics.push(diagnostic('TJ-INV-010', `${path}/evidence`, 'evidence must be an object.'));
  } else {
    exactFields(
      evidence,
      ['state', 'as_of', 'capability_version', 'package_digest', 'adapter_digest', 'reason'],
      `${path}/evidence`,
      'TJ-INV-010',
      diagnostics,
    );
    requireStrings(evidence, ['state', 'as_of', 'reason'], `${path}/evidence`, 'TJ-INV-010', diagnostics);
    if (nonempty(evidence.state) && !EVIDENCE_STATES.has(evidence.state)) {
      diagnostics.push(
        diagnostic('TJ-INV-010', `${path}/evidence/state`, 'Unknown W1 evidence state.'),
      );
    }
    for (const field of ['capability_version', 'package_digest', 'adapter_digest']) {
      if (evidence[field] !== null && !nonempty(evidence[field])) {
        diagnostics.push(
          diagnostic('TJ-INV-010', `${path}/evidence/${field}`, `${field} must be null or a non-empty string.`),
        );
      }
    }
    if (
      evidence.state === 'current' &&
      [evidence.capability_version, evidence.package_digest, evidence.adapter_digest].some(
        (field) => !nonempty(field),
      )
    ) {
      diagnostics.push(
        diagnostic('TJ-INV-010', `${path}/evidence`, 'current evidence requires exact version and digests.'),
      );
    }
  }

  const disposition = value.j2_disposition;
  if (!isObject(disposition)) {
    diagnostics.push(
      diagnostic('TJ-INV-011', `${path}/j2_disposition`, 'j2_disposition must be an object.'),
    );
  } else {
    exactFields(disposition, ['action', 'rationale'], `${path}/j2_disposition`, 'TJ-INV-011', diagnostics);
    requireStrings(disposition, ['action', 'rationale'], `${path}/j2_disposition`, 'TJ-INV-011', diagnostics);
    if (nonempty(disposition.action) && !DISPOSITIONS.has(disposition.action)) {
      diagnostics.push(
        diagnostic('TJ-INV-011', `${path}/j2_disposition/action`, 'Unknown J2 disposition.'),
      );
    }
  }
}

function repositorySkillPaths(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'SKILL.md')))
    .map((entry) => relative(REPO_ROOT, join(root, entry.name, 'SKILL.md')))
    .sort();
}

function validateInteractiveCoverage(inventory: JsonObject, diagnostics: Diagnostic[]) {
  const expected = repositorySkillPaths(join(REPO_ROOT, '.claude', 'skills'));
  const entries = Array.isArray(inventory.entries) ? inventory.entries : [];
  const declared = entries
    .filter(isObject)
    .filter((entry) => entry.provider === 'claude' && isObject(entry.source))
    .map((entry) => (entry.source as JsonObject).path)
    .filter(nonempty)
    .filter((path) => path.startsWith('.claude/skills/'))
    .sort();

  const missing = expected.filter((path) => !declared.includes(path));
  const extra = declared.filter((path) => !expected.includes(path));
  const duplicate = declared.filter((path, index) => declared.indexOf(path) !== index);
  if (missing.length) {
    diagnostics.push(
      diagnostic('TJ-INV-012', '/entries', `Missing interactive Claude sources: ${missing.join(', ')}.`),
    );
  }
  if (extra.length) {
    diagnostics.push(
      diagnostic('TJ-INV-012', '/entries', `Unknown interactive Claude sources: ${extra.join(', ')}.`),
    );
  }
  if (duplicate.length) {
    diagnostics.push(
      diagnostic('TJ-INV-012', '/entries', `Duplicate interactive Claude sources: ${[...new Set(duplicate)].join(', ')}.`),
    );
  }
}

function validateSessionHooks(inventory: JsonObject, diagnostics: Diagnostic[]) {
  const settingsPath = join(REPO_ROOT, '.claude', 'settings.json');
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as JsonObject;
  const hooks = isObject(settings.hooks) && Array.isArray(settings.hooks.SessionStart)
    ? settings.hooks.SessionStart
    : [];
  const commands = hooks
    .filter(isObject)
    .flatMap((group) => (Array.isArray(group.hooks) ? group.hooks : []))
    .filter(isObject)
    .map((hook) => hook.command)
    .filter(nonempty)
    .sort();
  const declarations = Array.isArray(inventory.session_hooks) ? inventory.session_hooks : [];
  const declared = declarations
    .filter(isObject)
    .map((hook) => hook.command)
    .filter(nonempty)
    .sort();
  if (JSON.stringify(commands) !== JSON.stringify(declared)) {
    diagnostics.push(
      diagnostic(
        'TJ-INV-013',
        '/session_hooks',
        'Session hook inventory must exactly match .claude/settings.json commands.',
      ),
    );
  }
}

function validateSupportingCollections(inventory: JsonObject, diagnostics: Diagnostic[]) {
  const entryIds = new Set(
    (Array.isArray(inventory.entries) ? inventory.entries : [])
      .filter(isObject)
      .map((entry) => entry.id)
      .filter(nonempty),
  );
  const affectedEntrySentinels = new Set(['All repository-authored Claude entries']);

  for (const collection of ['discovery_surfaces', 'session_hooks', 'tool_mappings', 'known_gaps']) {
    const value = inventory[collection];
    if (!Array.isArray(value) || value.length === 0 || !value.every(isObject)) {
      diagnostics.push(
        diagnostic('TJ-INV-014', `/${collection}`, `${collection} must be a non-empty object array.`),
      );
    }
  }

  if (Array.isArray(inventory.discovery_surfaces)) {
    inventory.discovery_surfaces.forEach((surface, index) => {
      const path = `/discovery_surfaces/${index}`;
      if (!isObject(surface)) return;
      exactFields(
        surface,
        ['id', 'provider', 'location_class', 'path', 'coverage'],
        path,
        'TJ-INV-014',
        diagnostics,
      );
      requireStrings(
        surface,
        ['id', 'provider', 'location_class', 'path', 'coverage'],
        path,
        'TJ-INV-014',
        diagnostics,
      );
      if (nonempty(surface.provider) && !PROVIDERS.has(surface.provider)) {
        diagnostics.push(
          diagnostic('TJ-INV-014', `${path}/provider`, 'Unknown discovery provider.'),
        );
      }
      if (
        nonempty(surface.location_class) &&
        !LOCATION_CLASSES.has(surface.location_class)
      ) {
        diagnostics.push(
          diagnostic('TJ-INV-014', `${path}/location_class`, 'Unknown discovery location_class.'),
        );
      }
      if (
        surface.location_class === 'repository' &&
        nonempty(surface.path) &&
        (!safeRepositoryPath(surface.path) || !existsSync(join(REPO_ROOT, surface.path)))
      ) {
        diagnostics.push(
          diagnostic('TJ-INV-014', `${path}/path`, 'Repository discovery surface does not exist.'),
        );
      }
    });
  }

  if (Array.isArray(inventory.tool_mappings)) {
    inventory.tool_mappings.forEach((mapping, index) => {
      const path = `/tool_mappings/${index}`;
      if (!isObject(mapping)) return;
      exactFields(
        mapping,
        [
          'id',
          'claude_surface',
          'codex_mapping',
          'authority',
          'prerequisites',
          'limitations',
          'affected_entries',
        ],
        path,
        'TJ-INV-014',
        diagnostics,
      );
      requireStrings(
        mapping,
        ['id', 'claude_surface', 'codex_mapping', 'authority'],
        path,
        'TJ-INV-014',
        diagnostics,
      );
      for (const field of ['prerequisites', 'limitations', 'affected_entries']) {
        if (!stringArray(mapping[field])) {
          diagnostics.push(
            diagnostic('TJ-INV-014', `${path}/${field}`, `${field} must be a non-empty string array.`),
          );
        }
      }
      if (Array.isArray(mapping.affected_entries)) {
        mapping.affected_entries.filter(nonempty).forEach((entryId) => {
          if (!affectedEntrySentinels.has(entryId) && !entryIds.has(entryId)) {
            diagnostics.push(
              diagnostic(
                'TJ-INV-014',
                `${path}/affected_entries`,
                `Unknown affected inventory entry: ${entryId}.`,
              ),
            );
          }
        });
      }
    });
  }

  if (Array.isArray(inventory.session_hooks)) {
    inventory.session_hooks.forEach((hook, index) => {
      const path = `/session_hooks/${index}`;
      if (!isObject(hook)) return;
      exactFields(
        hook,
        ['id', 'provider', 'trigger', 'command', 'purpose', 'availability', 'limitation'],
        path,
        'TJ-INV-014',
        diagnostics,
      );
      requireStrings(
        hook,
        ['id', 'provider', 'trigger', 'command', 'purpose', 'availability', 'limitation'],
        path,
        'TJ-INV-014',
        diagnostics,
      );
    });
  }

  if (Array.isArray(inventory.known_gaps)) {
    inventory.known_gaps.forEach((gap, index) => {
      const path = `/known_gaps/${index}`;
      if (!isObject(gap)) return;
      exactFields(gap, ['id', 'classification', 'detail'], path, 'TJ-INV-014', diagnostics);
      requireStrings(gap, ['id', 'classification', 'detail'], path, 'TJ-INV-014', diagnostics);
    });
  }
}

export function validateInventory(inventory: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isObject(inventory)) {
    return [diagnostic('TJ-INV-001', '/', 'Inventory must be a JSON object.')];
  }
  exactFields(
    inventory,
    [
      'schema_version',
      'inventory_kind',
      'as_of',
      'accepted_workspace_revision',
      'authority',
      'entries',
      'discovery_surfaces',
      'session_hooks',
      'tool_mappings',
      'known_gaps',
    ],
    '/',
    'TJ-INV-002',
    diagnostics,
  );
  requireStrings(
    inventory,
    ['schema_version', 'inventory_kind', 'as_of', 'accepted_workspace_revision', 'authority'],
    '/',
    'TJ-INV-002',
    diagnostics,
  );
  if (inventory.schema_version !== '1.0.0') {
    diagnostics.push(diagnostic('TJ-INV-002', '/schema_version', 'schema_version must be 1.0.0.'));
  }
  if (inventory.inventory_kind !== 'interactive') {
    diagnostics.push(diagnostic('TJ-INV-002', '/inventory_kind', 'inventory_kind must be interactive.'));
  }
  if (inventory.accepted_workspace_revision !== ACCEPTED_WORKSPACE_REVISION) {
    diagnostics.push(
      diagnostic(
        'TJ-INV-002',
        '/accepted_workspace_revision',
        `accepted_workspace_revision must be ${ACCEPTED_WORKSPACE_REVISION}.`,
      ),
    );
  }
  if (!Array.isArray(inventory.entries) || inventory.entries.length === 0) {
    diagnostics.push(diagnostic('TJ-INV-003', '/entries', 'entries must be a non-empty array.'));
  } else {
    inventory.entries.forEach((entry, index) => validateEntry(entry, index, diagnostics));
    const ids = inventory.entries
      .filter(isObject)
      .map((entry) => entry.id)
      .filter(nonempty);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length) {
      diagnostics.push(
        diagnostic('TJ-INV-003', '/entries', `Duplicate entry ids: ${[...new Set(duplicateIds)].join(', ')}.`),
      );
    }
  }
  validateSupportingCollections(inventory, diagnostics);
  validateInteractiveCoverage(inventory, diagnostics);
  validateSessionHooks(inventory, diagnostics);
  return diagnostics;
}

function parseArgs(argv: string[]) {
  let format = 'human';
  let inventoryPath = DEFAULT_INVENTORY;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--format') {
      format = argv[index + 1] ?? '';
      index += 1;
    } else if (arg.startsWith('--format=')) {
      format = arg.slice('--format='.length);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      inventoryPath = resolve(arg);
    }
  }
  if (!['human', 'json'].includes(format)) {
    throw new Error('--format must be human or json.');
  }
  return { format, inventoryPath };
}

function main() {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  let inventory: unknown;
  try {
    if (!existsSync(args.inventoryPath) || !statSync(args.inventoryPath).isFile()) {
      throw new Error('Inventory file does not exist.');
    }
    inventory = JSON.parse(readFileSync(args.inventoryPath, 'utf8'));
  } catch (error) {
    const diagnostics = [
      diagnostic(
        'TJ-INV-001',
        '/',
        error instanceof Error ? error.message : 'Inventory is not readable JSON.',
      ),
    ];
    const report = {
      kind: 'ProviderAdapterInventoryValidation',
      schema_version: '1.0.0',
      outcome: 'invalid',
      subject: relative(REPO_ROOT, args.inventoryPath),
      diagnostics,
    };
    console.log(
      args.format === 'json'
        ? JSON.stringify(report, null, 2)
        : `Provider Adapter inventory: invalid\n- [${diagnostics[0].requirement}] ${diagnostics[0].path}: ${diagnostics[0].message}`,
    );
    process.exit(1);
  }

  const diagnostics = validateInventory(inventory);
  const report = {
    kind: 'ProviderAdapterInventoryValidation',
    schema_version: '1.0.0',
    outcome: diagnostics.length === 0 ? 'valid' : 'invalid',
    subject: relative(REPO_ROOT, args.inventoryPath),
    inventory_kind: isObject(inventory) ? inventory.inventory_kind : null,
    entries: isObject(inventory) && Array.isArray(inventory.entries) ? inventory.entries.length : 0,
    diagnostics,
  };
  if (args.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Provider Adapter inventory: ${report.outcome}`);
    console.log(`Subject: ${report.subject}`);
    console.log(`Entries: ${report.entries}`);
    for (const item of diagnostics) {
      console.log(`- [${item.requirement}] ${item.path}: ${item.message}`);
    }
  }
  process.exit(diagnostics.length === 0 ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
