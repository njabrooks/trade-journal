#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from '../lib/skillBody.js';

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
  'governed-provider-adapter',
  'historical-evidence',
  'protective-tombstone',
]);
const LOCATION_CLASSES = new Set(['repository', 'external-bridge']);
const INVOCATION_MODES = new Set(['interactive', 'headless', 'scheduled']);
const OWNERSHIP_PREFIXES = ['repository:', 'machine-local:', 'workspace:', 'external:'];
const CONTRACT_CLASSES = new Set(['generic', 'bespoke']);
const RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

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

function fileDigest(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function bytesDigest(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function gitObject(repository: string, revision: string, path: string): Buffer {
  return execFileSync('git', ['-C', repository, 'show', `${revision}:${path}`], {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
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

function validateRepositorySource(
  value: unknown,
  path: string,
  requirement: string,
  diagnostics: Diagnostic[],
) {
  if (!isObject(value)) {
    diagnostics.push(diagnostic(requirement, path, `${path.split('/').at(-1)} must be an object.`));
    return;
  }
  exactFields(value, ['ownership', 'location_class', 'path'], path, requirement, diagnostics);
  requireStrings(value, ['ownership', 'location_class', 'path'], path, requirement, diagnostics);
  if (value.location_class !== 'repository') {
    diagnostics.push(diagnostic(requirement, `${path}/location_class`, 'Source must use a repository location.'));
  }
  if (nonempty(value.path)) {
    if (!safeRepositoryPath(value.path)) {
      diagnostics.push(diagnostic(requirement, `${path}/path`, 'Source must be a safe relative path.'));
    } else if (!existsSync(join(REPO_ROOT, value.path))) {
      diagnostics.push(diagnostic(requirement, `${path}/path`, 'Source path does not exist.'));
    }
  }
}

function validateEntry(
  value: unknown,
  index: number,
  inventoryKind: 'interactive' | 'headless',
  diagnostics: Diagnostic[],
) {
  const path = `/entries/${index}`;
  if (!isObject(value)) {
    diagnostics.push(diagnostic('TJ-INV-003', path, 'Inventory entry must be an object.'));
    return;
  }
  const hasMigrationInput = isObject(value.migration_input);
  const hasGovernedBinding = isObject(value.governed_binding);
  const hasFederatedBinding = isObject(value.federated_binding);
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
      ...(hasMigrationInput ? ['migration_input'] : []),
      ...(hasGovernedBinding ? ['governed_binding'] : []),
      ...(hasFederatedBinding ? ['federated_binding'] : []),
      ...(inventoryKind === 'headless'
        ? ['authored_source', 'execution_contract', 'operational_risk']
        : []),
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
  if (hasMigrationInput) {
    validateRepositorySource(
      value.migration_input,
      `${path}/migration_input`,
      'TJ-INV-015',
      diagnostics,
    );
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
    if (invocation.mode !== inventoryKind) {
      diagnostics.push(
        diagnostic(
          'TJ-INV-006',
          `${path}/invocation/mode`,
          `${inventoryKind === 'interactive' ? 'Interactive' : 'Headless'} inventory entries must use ${inventoryKind} invocation mode.`,
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
    if (evidence.state === 'current' && value.packaging !== 'governed-provider-adapter') {
      diagnostics.push(
        diagnostic(
          'TJ-INV-010',
          `${path}/packaging`,
          'current evidence requires governed-provider-adapter packaging.',
        ),
      );
    }
    if (evidence.state === 'current' && !hasGovernedBinding && !hasFederatedBinding) {
      diagnostics.push(
        diagnostic(
          'TJ-INV-016',
          path,
          'current evidence requires an exact local or federated governed binding.',
        ),
      );
    }
  }

  if (hasGovernedBinding) {
    const binding = value.governed_binding as JsonObject;
    exactFields(
      binding,
      ['package_path', 'adapter_id', 'evidence_path', 'staged_entry_point'],
      `${path}/governed_binding`,
      'TJ-INV-016',
      diagnostics,
    );
    requireStrings(
      binding,
      ['package_path', 'adapter_id', 'evidence_path', 'staged_entry_point'],
      `${path}/governed_binding`,
      'TJ-INV-016',
      diagnostics,
    );
    for (const field of ['package_path', 'evidence_path', 'staged_entry_point']) {
      const fieldValue = binding[field];
      if (
        nonempty(fieldValue) &&
        (!safeRepositoryPath(fieldValue) || !existsSync(join(REPO_ROOT, fieldValue)))
      ) {
        diagnostics.push(
          diagnostic(
            'TJ-INV-016',
            `${path}/governed_binding/${field}`,
            `${field} must resolve in the repository.`,
          ),
        );
      }
    }

    const sourcePath = isObject(value.source) ? value.source.path : null;
    const packagePath = binding.package_path;
    const evidencePath = binding.evidence_path;
    if (
      nonempty(sourcePath) &&
      safeRepositoryPath(sourcePath) &&
      existsSync(join(REPO_ROOT, sourcePath)) &&
      nonempty(packagePath) &&
      safeRepositoryPath(packagePath) &&
      existsSync(join(REPO_ROOT, packagePath)) &&
      nonempty(evidencePath) &&
      safeRepositoryPath(evidencePath) &&
      existsSync(join(REPO_ROOT, evidencePath))
    ) {
      try {
        const capabilityPackage = JSON.parse(
          readFileSync(join(REPO_ROOT, packagePath), 'utf8'),
        ) as JsonObject;
        const adapterEvidence = JSON.parse(
          readFileSync(join(REPO_ROOT, evidencePath), 'utf8'),
        ) as JsonObject;
        const packageAdapters = Array.isArray(capabilityPackage.provider_adapters)
          ? capabilityPackage.provider_adapters.filter(isObject)
          : [];
        const packageAdapter = packageAdapters.find(
          (adapter) => adapter.id === binding.adapter_id,
        );
        const packageDirectory = dirname(join(REPO_ROOT, packagePath));
        const expectedSource =
          packageAdapter && nonempty(packageAdapter.source)
            ? relative(REPO_ROOT, resolve(packageDirectory, packageAdapter.source))
            : null;
        const expectedEvidence =
          packageAdapter && nonempty(packageAdapter.evidence)
            ? relative(REPO_ROOT, resolve(packageDirectory, packageAdapter.evidence))
            : null;
        const inventoryEvidence = isObject(value.evidence) ? value.evidence : {};

        if (
          capabilityPackage.id !== (isObject(value.candidate_capability) ? value.candidate_capability.id : null) ||
          capabilityPackage.version !== inventoryEvidence.capability_version ||
          !packageAdapter ||
          packageAdapter.provider !== value.provider ||
          expectedSource !== sourcePath ||
          expectedEvidence !== evidencePath ||
          adapterEvidence.adapter_id !== binding.adapter_id ||
          adapterEvidence.capability_id !== capabilityPackage.id ||
          adapterEvidence.capability_version !== capabilityPackage.version ||
          adapterEvidence.package_digest !== inventoryEvidence.package_digest ||
          adapterEvidence.adapter_digest !== inventoryEvidence.adapter_digest ||
          inventoryEvidence.package_digest !== fileDigest(join(REPO_ROOT, packagePath)) ||
          inventoryEvidence.adapter_digest !== fileDigest(join(REPO_ROOT, sourcePath))
        ) {
          diagnostics.push(
            diagnostic(
              'TJ-INV-016',
              `${path}/governed_binding`,
              'Governed binding must match the exact Capability Package, Provider Adapter, evidence record, and digests.',
            ),
          );
        }
      } catch {
        diagnostics.push(
          diagnostic(
            'TJ-INV-016',
            `${path}/governed_binding`,
            'Governed binding files must be readable JSON where required.',
          ),
        );
      }
    }
  }

  if (hasFederatedBinding) {
    const binding = value.federated_binding as JsonObject;
    const bindingPath = `${path}/federated_binding`;
    exactFields(
      binding,
      ['registry_path', 'lock_path', 'capability_id', 'adapter_id'],
      bindingPath,
      'TJ-INV-017',
      diagnostics,
    );
    requireStrings(
      binding,
      ['registry_path', 'lock_path', 'capability_id', 'adapter_id'],
      bindingPath,
      'TJ-INV-017',
      diagnostics,
    );

    const registryPath = binding.registry_path;
    const lockPath = binding.lock_path;
    if (
      nonempty(registryPath) &&
      nonempty(lockPath) &&
      safeRepositoryPath(registryPath) &&
      safeRepositoryPath(lockPath) &&
      existsSync(join(REPO_ROOT, registryPath)) &&
      existsSync(join(REPO_ROOT, lockPath))
    ) {
      try {
        const registry = JSON.parse(
          readFileSync(join(REPO_ROOT, registryPath), 'utf8'),
        ) as JsonObject;
        const lock = JSON.parse(
          readFileSync(join(REPO_ROOT, lockPath), 'utf8'),
        ) as JsonObject;
        const registryEntry = (Array.isArray(registry.capabilities)
          ? registry.capabilities.filter(isObject)
          : []
        ).find((entry) => entry.id === binding.capability_id);
        const lockedEntry = (Array.isArray(lock.capabilities)
          ? lock.capabilities.filter(isObject)
          : []
        ).find((entry) => entry.id === binding.capability_id);
        if (!registryEntry || !lockedEntry) throw new Error('missing Registry or Lock entry');

        const release = isObject(registryEntry.release) ? registryEntry.release : {};
        const lockedSource = isObject(lockedEntry.source) ? lockedEntry.source : {};
        if (!nonempty(release.source) || !safeRepositoryPath(release.source)) {
          throw new Error('unsafe release source');
        }
        if (!nonempty(release.revision) || !nonempty(registryEntry.package_path)) {
          throw new Error('incomplete release binding');
        }
        const sourceRepository = resolve(dirname(join(REPO_ROOT, registryPath)), release.source);
        const packageJsonPath = `${registryEntry.package_path}/capability-package.json`;
        const packageBytes = gitObject(sourceRepository, release.revision, packageJsonPath);
        const capabilityPackage = JSON.parse(packageBytes.toString('utf8')) as JsonObject;
        const packageAdapters = Array.isArray(capabilityPackage.provider_adapters)
          ? capabilityPackage.provider_adapters.filter(isObject)
          : [];
        const packageAdapter = packageAdapters.find(
          (adapter) => adapter.id === binding.adapter_id,
        );
        if (!packageAdapter || !nonempty(packageAdapter.source) || !nonempty(packageAdapter.evidence)) {
          throw new Error('missing package adapter');
        }

        const adapterPath = `${registryEntry.package_path}/${packageAdapter.source}`;
        const evidencePath = `${registryEntry.package_path}/${packageAdapter.evidence}`;
        const adapterBytes = gitObject(sourceRepository, release.revision, adapterPath);
        const adapterEvidence = JSON.parse(
          gitObject(sourceRepository, release.revision, evidencePath).toString('utf8'),
        ) as JsonObject;
        const lockedAdapters = Array.isArray(lockedEntry.provider_adapters)
          ? lockedEntry.provider_adapters.filter(isObject)
          : [];
        const lockedAdapter = lockedAdapters.find(
          (adapter) => adapter.id === binding.adapter_id,
        );
        const inventoryEvidence = isObject(value.evidence) ? value.evidence : {};
        const candidate = isObject(value.candidate_capability)
          ? value.candidate_capability
          : {};
        const inventorySource = isObject(value.source) ? value.source : {};
        const expectedSource = `${registryEntry.repository}@${release.revision}:${adapterPath}`;
        const expectedOwnership = nonempty(registryEntry.repository)
          ? registryEntry.repository.replace(/^github:/, 'repository:')
          : null;

        if (
          binding.capability_id !== candidate.id ||
          candidate.authority !== registryEntry.authority ||
          registryEntry.authority !== lockedEntry.authority ||
          registryEntry.repository !== lockedEntry.repository ||
          registryEntry.approved_version !== lockedEntry.approved_version ||
          release.revision !== lockedSource.revision ||
          release.revision !== lockedSource.release_reference ||
          registryEntry.package_path !== lockedSource.package_path ||
          capabilityPackage.id !== binding.capability_id ||
          capabilityPackage.authority !== registryEntry.authority ||
          capabilityPackage.version !== registryEntry.approved_version ||
          JSON.stringify(capabilityPackage.dependencies ?? []) !==
            JSON.stringify(lockedEntry.dependencies ?? []) ||
          !packageAdapter ||
          packageAdapter.provider !== value.provider ||
          !lockedAdapter ||
          lockedAdapter.provider !== value.provider ||
          lockedAdapter.source !== packageAdapter.source ||
          lockedAdapter.evidence !== packageAdapter.evidence ||
          lockedAdapter.state !== adapterEvidence.support_state ||
          lockedAdapter.validated_at !== adapterEvidence.validated_at ||
          inventoryEvidence.state !== adapterEvidence.support_state ||
          inventoryEvidence.state !== lockedAdapter.state ||
          inventoryEvidence.as_of !== adapterEvidence.validated_at ||
          inventorySource.ownership !== expectedOwnership ||
          inventorySource.location_class !== 'external-bridge' ||
          inventorySource.path !== expectedSource ||
          adapterEvidence.adapter_id !== binding.adapter_id ||
          adapterEvidence.capability_id !== binding.capability_id ||
          adapterEvidence.capability_version !== registryEntry.approved_version ||
          inventoryEvidence.capability_version !== registryEntry.approved_version ||
          inventoryEvidence.package_digest !== lockedEntry.package_digest ||
          inventoryEvidence.package_digest !== adapterEvidence.package_digest ||
          inventoryEvidence.package_digest !== bytesDigest(packageBytes) ||
          inventoryEvidence.adapter_digest !== adapterEvidence.adapter_digest ||
          inventoryEvidence.adapter_digest !== bytesDigest(adapterBytes)
        ) {
          throw new Error('federated values do not match');
        }
      } catch {
        diagnostics.push(
          diagnostic(
            'TJ-INV-017',
            bindingPath,
            'Federated binding must resolve the exact Registry/Lock Capability Package, Provider Adapter, evidence record, dependencies, revision, and digests.',
          ),
        );
      }
    } else {
      diagnostics.push(
        diagnostic(
          'TJ-INV-017',
          bindingPath,
          'Federated Registry and Lock paths must resolve in the repository.',
        ),
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

  const candidate = isObject(value.candidate_capability)
    ? value.candidate_capability
    : null;
  if (candidate?.status === 'not-candidate') {
    const protective = isObject(lifecycle) && lifecycle.protective_tombstone === true;
    const expectedPackaging = protective ? 'protective-tombstone' : 'historical-evidence';
    const sourcePath = isObject(value.source) ? value.source.path : null;
    const consumers = value.operational_consumers;

    if (value.packaging !== expectedPackaging) {
      diagnostics.push(
        diagnostic(
          'TJ-INV-018',
          `${path}/packaging`,
          `Non-candidate final disposition must use ${expectedPackaging} packaging.`,
        ),
      );
    }
    if (protective && (!isObject(lifecycle) || lifecycle.status !== 'tombstone')) {
      diagnostics.push(
        diagnostic(
          'TJ-INV-018',
          `${path}/lifecycle/status`,
          'A retained protective boundary must use tombstone lifecycle status.',
        ),
      );
    }
    if (
      !protective &&
      (!nonempty(sourcePath) ||
        !sourcePath.startsWith('docs/archive/provider-adapters/issue-75/'))
    ) {
      diagnostics.push(
        diagnostic(
          'TJ-INV-018',
          `${path}/source/path`,
          'A non-protective non-candidate must resolve only as issue #75 historical evidence.',
        ),
      );
    }
    if (
      isObject(invocation) &&
      invocation.unattended_eligibility !== 'ineligible'
    ) {
      diagnostics.push(
        diagnostic(
          'TJ-INV-018',
          `${path}/invocation/unattended_eligibility`,
          'Non-candidates must remain ineligible for unattended execution.',
        ),
      );
    }
    if (!isObject(scope) || scope.writes !== 'No writes permitted.') {
      diagnostics.push(
        diagnostic(
          'TJ-INV-018',
          `${path}/authority_and_write_scope/writes`,
          'Non-candidates must grant no write authority.',
        ),
      );
    }
    const expectedConsumers = protective
      ? ['Safety boundary only; no operational consumer.']
      : ['None; historical evidence only.'];
    if (JSON.stringify(consumers) !== JSON.stringify(expectedConsumers)) {
      diagnostics.push(
        diagnostic(
          'TJ-INV-018',
          `${path}/operational_consumers`,
          'Non-candidates must declare no operational consumer.',
        ),
      );
    }
    if (!isObject(evidence) || evidence.state !== 'unavailable') {
      diagnostics.push(
        diagnostic(
          'TJ-INV-018',
          `${path}/evidence/state`,
          'Non-candidates must retain honest unavailable evidence.',
        ),
      );
    }
    if (!isObject(disposition) || disposition.action !== 'retire') {
      diagnostics.push(
        diagnostic(
          'TJ-INV-018',
          `${path}/j2_disposition/action`,
          'Non-candidate final disposition must be retire.',
        ),
      );
    }
  }

  if (inventoryKind === 'headless') {
    validateRepositorySource(value.authored_source, `${path}/authored_source`, 'TJ-HEAD-003', diagnostics);

    const contract = value.execution_contract;
    if (!isObject(contract)) {
      diagnostics.push(diagnostic('TJ-HEAD-004', `${path}/execution_contract`, 'execution_contract must be an object.'));
    } else {
      exactFields(contract, ['class', 'preamble_path', 'readiness'], `${path}/execution_contract`, 'TJ-HEAD-004', diagnostics);
      requireStrings(contract, ['class', 'preamble_path', 'readiness'], `${path}/execution_contract`, 'TJ-HEAD-004', diagnostics);
      if (nonempty(contract.class) && !CONTRACT_CLASSES.has(contract.class)) {
        diagnostics.push(diagnostic('TJ-HEAD-004', `${path}/execution_contract/class`, 'Contract class must be generic or bespoke.'));
      }
      if (nonempty(contract.preamble_path) && (!safeRepositoryPath(contract.preamble_path) || !existsSync(join(REPO_ROOT, contract.preamble_path)))) {
        diagnostics.push(diagnostic('TJ-HEAD-004', `${path}/execution_contract/preamble_path`, 'Headless preamble path must resolve in the repository.'));
      }
    }

    const risk = value.operational_risk;
    if (!isObject(risk)) {
      diagnostics.push(diagnostic('TJ-HEAD-005', `${path}/operational_risk`, 'operational_risk must be an object.'));
    } else {
      exactFields(risk, ['level', 'priority', 'rationale'], `${path}/operational_risk`, 'TJ-HEAD-005', diagnostics);
      requireStrings(risk, ['level', 'rationale'], `${path}/operational_risk`, 'TJ-HEAD-005', diagnostics);
      if (nonempty(risk.level) && !RISK_LEVELS.has(risk.level)) {
        diagnostics.push(diagnostic('TJ-HEAD-005', `${path}/operational_risk/level`, 'Unknown operational risk level.'));
      }
      if (risk.priority !== null && (!Number.isInteger(risk.priority) || (risk.priority as number) < 1)) {
        diagnostics.push(diagnostic('TJ-HEAD-005', `${path}/operational_risk/priority`, 'priority must be null or a positive integer.'));
      }
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
    .map((entry) =>
      isObject(entry.migration_input)
        ? entry.migration_input.path
        : (entry.source as JsonObject).path,
    )
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

function validateHeadlessCoverage(inventory: JsonObject, diagnostics: Diagnostic[]) {
  const expected = repositorySkillPaths(join(REPO_ROOT, '.agents', 'skills'));
  const entries = Array.isArray(inventory.entries) ? inventory.entries : [];
  const declared = entries
    .filter(isObject)
    .filter((entry) => entry.provider === 'codex' && isObject(entry.source))
    .map((entry) =>
      isObject(entry.migration_input)
        ? entry.migration_input.path
        : (entry.source as JsonObject).path,
    )
    .filter(nonempty)
    .filter((path) => path.startsWith('.agents/skills/'))
    .sort();
  const missing = expected.filter((path) => !declared.includes(path));
  const extra = declared.filter((path) => !expected.includes(path));
  const duplicate = declared.filter((path, index) => declared.indexOf(path) !== index);
  if (missing.length) diagnostics.push(diagnostic('TJ-HEAD-006', '/entries', `Missing headless projections: ${missing.join(', ')}.`));
  if (extra.length) diagnostics.push(diagnostic('TJ-HEAD-006', '/entries', `Unknown headless projections: ${extra.join(', ')}.`));
  if (duplicate.length) diagnostics.push(diagnostic('TJ-HEAD-006', '/entries', `Duplicate headless projections: ${[...new Set(duplicate)].join(', ')}.`));

  for (const [index, rawEntry] of entries.entries()) {
    if (!isObject(rawEntry) || !isObject(rawEntry.source) || !isObject(rawEntry.authored_source) || !isObject(rawEntry.execution_contract)) continue;
    if (rawEntry.packaging === 'historical-evidence') continue;
    const sourcePath = isObject(rawEntry.migration_input)
      ? rawEntry.migration_input.path
      : rawEntry.source.path;
    const authoredPath = rawEntry.authored_source.path;
    if (!nonempty(sourcePath) || !nonempty(authoredPath)) continue;
    const match = sourcePath.match(/^\.agents\/skills\/([^/]+)\/SKILL\.md$/);
    if (!match || authoredPath !== `.claude/skills/${match[1]}/SKILL.md`) {
      diagnostics.push(diagnostic('TJ-HEAD-007', `/entries/${index}/authored_source/path`, 'Projection must link to the same-named authored Claude source.'));
      continue;
    }
    const skillName = match[1];
    const sourceAbsolute = join(REPO_ROOT, sourcePath);
    const authoredAbsolute = join(REPO_ROOT, authoredPath);
    if (existsSync(sourceAbsolute) && existsSync(authoredAbsolute)) {
      const expectedBody = splitFrontmatter(readFileSync(authoredAbsolute, 'utf8')).body;
      if (readFileSync(sourceAbsolute, 'utf8') !== expectedBody) {
        diagnostics.push(diagnostic('TJ-HEAD-007', `/entries/${index}/source/path`, 'Generated projection is stale against its authored source.'));
      }
    }
    const skillJson = `.agents/skills/${skillName}/skill.json`;
    if (!existsSync(join(REPO_ROOT, skillJson))) {
      diagnostics.push(diagnostic('TJ-HEAD-007', `/entries/${index}/source/path`, `Projection package is missing ${skillJson}.`));
    }
    const bespokePreamble = `.claude/skills/${skillName}/HEADLESS_PREAMBLE.md`;
    const expectedClass = existsSync(join(REPO_ROOT, bespokePreamble)) ? 'bespoke' : 'generic';
    if (rawEntry.execution_contract.class !== expectedClass) {
      diagnostics.push(diagnostic('TJ-HEAD-004', `/entries/${index}/execution_contract/class`, `Contract class must be ${expectedClass} for ${skillName}.`));
    }
    const expectedPreamble = expectedClass === 'bespoke'
      ? bespokePreamble
      : `.agents/skills/${skillName}/HEADLESS_PREAMBLE.md`;
    if (rawEntry.execution_contract.preamble_path !== expectedPreamble) {
      diagnostics.push(diagnostic('TJ-HEAD-004', `/entries/${index}/execution_contract/preamble_path`, `preamble_path must be ${expectedPreamble}.`));
    }
    if (['decisions', 'thesis'].includes(skillName) && isObject(rawEntry.invocation) && rawEntry.invocation.unattended_eligibility !== 'ineligible') {
      diagnostics.push(diagnostic('TJ-HEAD-008', `/entries/${index}/invocation/unattended_eligibility`, `${skillName} must remain ineligible for unattended execution.`));
    }
  }
}

function validateHeadlessCollections(inventory: JsonObject, diagnostics: Diagnostic[]) {
  const entryIds = new Set(
    (Array.isArray(inventory.entries) ? inventory.entries : []).filter(isObject).map((entry) => entry.id).filter(nonempty),
  );
  const expectedTopCollections = ['operational_workflows', 'deterministic_exclusions', 'known_gaps'];
  for (const collection of expectedTopCollections) {
    if (!Array.isArray(inventory[collection]) || (inventory[collection] as unknown[]).length === 0) {
      diagnostics.push(diagnostic('TJ-HEAD-009', `/${collection}`, `${collection} must be a non-empty array.`));
    }
  }

  if (Array.isArray(inventory.operational_workflows)) {
    inventory.operational_workflows.forEach((workflow, index) => {
      const path = `/operational_workflows/${index}`;
      if (!isObject(workflow)) {
        diagnostics.push(diagnostic('TJ-HEAD-010', path, 'Operational workflow must be an object.'));
        return;
      }
      exactFields(workflow, [
        'id', 'invoked_adapter_source', 'migration_target_entry', 'provider', 'model', 'invocation',
        'schedule', 'wrapper', 'scheduler',
        'reads', 'writes', 'environment', 'timeout_seconds', 'stale_lock_seconds', 'locking',
        'failure_behavior', 'consumers', 'prerequisites', 'operational_risk', 'risk_priority',
        'j2_disposition',
      ], path, 'TJ-HEAD-010', diagnostics);
      requireStrings(workflow, [
        'id', 'invoked_adapter_source', 'migration_target_entry', 'provider', 'model', 'invocation',
        'schedule', 'wrapper', 'scheduler',
        'reads', 'writes', 'environment', 'locking', 'failure_behavior', 'consumers', 'operational_risk',
        'j2_disposition',
      ], path, 'TJ-HEAD-010', diagnostics);
      if (!entryIds.has(workflow.migration_target_entry as string)) {
        diagnostics.push(diagnostic('TJ-HEAD-010', `${path}/migration_target_entry`, `Unknown headless migration target: ${String(workflow.migration_target_entry)}.`));
      }
      if (
        nonempty(workflow.invoked_adapter_source) &&
        (!safeRepositoryPath(workflow.invoked_adapter_source) ||
          !existsSync(join(REPO_ROOT, workflow.invoked_adapter_source)))
      ) {
        diagnostics.push(diagnostic('TJ-HEAD-010', `${path}/invoked_adapter_source`, 'Invoked adapter source must resolve in the repository.'));
      }
      for (const field of ['wrapper', 'scheduler']) {
        if (nonempty(workflow[field]) && (!safeRepositoryPath(workflow[field] as string) || !existsSync(join(REPO_ROOT, workflow[field] as string)))) {
          diagnostics.push(diagnostic('TJ-HEAD-010', `${path}/${field}`, `${field} must resolve in the repository.`));
        }
      }
      for (const field of ['timeout_seconds', 'stale_lock_seconds']) {
        if (!Number.isInteger(workflow[field]) || (workflow[field] as number) < 1) {
          diagnostics.push(diagnostic('TJ-HEAD-010', `${path}/${field}`, `${field} must be a positive integer.`));
        }
      }
      if (!stringArray(workflow.prerequisites)) {
        diagnostics.push(diagnostic('TJ-HEAD-010', `${path}/prerequisites`, 'prerequisites must be a non-empty string array.'));
      }
      if (nonempty(workflow.operational_risk) && !RISK_LEVELS.has(workflow.operational_risk)) {
        diagnostics.push(diagnostic('TJ-HEAD-010', `${path}/operational_risk`, 'Unknown operational risk level.'));
      }
      if (!Number.isInteger(workflow.risk_priority) || (workflow.risk_priority as number) < 1) {
        diagnostics.push(diagnostic('TJ-HEAD-010', `${path}/risk_priority`, 'risk_priority must be a positive integer.'));
      }
    });
    if (inventory.operational_workflows.length !== 5) {
      diagnostics.push(diagnostic('TJ-HEAD-010', '/operational_workflows', 'Exactly five live provider-dependent scheduled jobs must be inventoried.'));
    }
  }

  if (Array.isArray(inventory.deterministic_exclusions)) {
    inventory.deterministic_exclusions.forEach((exclusion, index) => {
      const path = `/deterministic_exclusions/${index}`;
      if (!isObject(exclusion)) return;
      exactFields(exclusion, ['id', 'classification', 'path', 'context'], path, 'TJ-HEAD-011', diagnostics);
      requireStrings(exclusion, ['id', 'classification', 'path', 'context'], path, 'TJ-HEAD-011', diagnostics);
      if (nonempty(exclusion.path) && (!safeRepositoryPath(exclusion.path) || !existsSync(join(REPO_ROOT, exclusion.path)))) {
        diagnostics.push(diagnostic('TJ-HEAD-011', `${path}/path`, 'Excluded automation path must resolve in the repository.'));
      }
    });
  }

  const mirror = inventory.mirror_diagnostic;
  if (!isObject(mirror)) {
    diagnostics.push(diagnostic('TJ-HEAD-012', '/mirror_diagnostic', 'mirror_diagnostic must be an object.'));
  } else {
    exactFields(mirror, ['source_count', 'projection_count', 'missing', 'stale', 'supporting_tooling'], '/mirror_diagnostic', 'TJ-HEAD-012', diagnostics);
    const sourceCount = repositorySkillPaths(join(REPO_ROOT, '.claude', 'skills')).length;
    const projectionCount = repositorySkillPaths(join(REPO_ROOT, '.agents', 'skills')).length;
    if (mirror.source_count !== sourceCount || mirror.projection_count !== projectionCount) {
      diagnostics.push(diagnostic('TJ-HEAD-012', '/mirror_diagnostic', `Mirror counts must be source=${sourceCount}, projection=${projectionCount}.`));
    }
    if (!Array.isArray(mirror.missing) || mirror.missing.length !== 0 || !Array.isArray(mirror.stale) || mirror.stale.length !== 0) {
      diagnostics.push(diagnostic('TJ-HEAD-012', '/mirror_diagnostic', 'Checked-in mirror diagnostic must declare no missing or stale projections.'));
    }
    if (!nonempty(mirror.supporting_tooling) || !safeRepositoryPath(mirror.supporting_tooling) || !existsSync(join(REPO_ROOT, mirror.supporting_tooling))) {
      diagnostics.push(diagnostic('TJ-HEAD-012', '/mirror_diagnostic/supporting_tooling', 'supporting_tooling must resolve in the repository.'));
    }
  }
}

export function validateInventory(inventory: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isObject(inventory)) {
    return [diagnostic('TJ-INV-001', '/', 'Inventory must be a JSON object.')];
  }
  const inventoryKind = inventory.inventory_kind;
  const topFields = inventoryKind === 'headless'
    ? [
        'schema_version', 'inventory_kind', 'as_of', 'accepted_workspace_revision', 'authority',
        'entries', 'mirror_diagnostic', 'operational_workflows', 'deterministic_exclusions', 'known_gaps',
      ]
    : [
        'schema_version', 'inventory_kind', 'as_of', 'accepted_workspace_revision', 'authority',
        'entries', 'discovery_surfaces', 'session_hooks', 'tool_mappings', 'known_gaps',
      ];
  exactFields(
    inventory,
    topFields,
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
  if (!['interactive', 'headless'].includes(String(inventoryKind))) {
    diagnostics.push(diagnostic('TJ-INV-002', '/inventory_kind', 'inventory_kind must be interactive or headless.'));
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
    inventory.entries.forEach((entry, index) => validateEntry(entry, index, inventoryKind as 'interactive' | 'headless', diagnostics));
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
  if (inventoryKind === 'headless') {
    validateHeadlessCoverage(inventory, diagnostics);
    validateHeadlessCollections(inventory, diagnostics);
  } else {
    validateSupportingCollections(inventory, diagnostics);
    validateInteractiveCoverage(inventory, diagnostics);
    validateSessionHooks(inventory, diagnostics);
  }
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
