#!/usr/bin/env tsx

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateInventory } from "./validate-provider-adapter-inventory.js";

type JsonObject = Record<string, unknown>;

export type Diagnostic = {
  requirement: string;
  path: string;
  message: string;
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const INTERACTIVE_INVENTORY = resolve(
  REPO_ROOT,
  "docs/agents/provider-adapters/interactive-inventory.json",
);
const HEADLESS_INVENTORY = resolve(
  REPO_ROOT,
  "docs/agents/provider-adapters/headless-inventory.json",
);
const DEFAULT_ELIGIBILITY = resolve(
  REPO_ROOT,
  "docs/agents/provider-adapters/generation-eligibility.json",
);

export const ACCEPTED_WORKSPACE_REVISION =
  "2b6ea3e02ff5ba114b0f91dd779c4afb26181358";
export const GOVERNED_EVIDENCE_DATE = "2026-08-11";
export const GOVERNED_OUTPUTS = [
  "docs/agents/provider-entry-points/staging/claude.md",
  "docs/agents/provider-entry-points/staging/codex.md",
];

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function diagnostic(
  requirement: string,
  path: string,
  message: string,
): Diagnostic {
  return { requirement, path, message };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function inventoryEntries(inventory: unknown): JsonObject[] {
  if (!isObject(inventory) || !Array.isArray(inventory.entries)) return [];
  return inventory.entries.filter(isObject);
}

function projectEntry(entry: JsonObject): JsonObject {
  const candidate = isObject(entry.candidate_capability)
    ? entry.candidate_capability
    : {
        status: "not-candidate",
        reason: "Candidate Capability declaration is missing.",
      };
  const source = isObject(entry.source) ? entry.source : {};
  const lifecycle = isObject(entry.lifecycle) ? entry.lifecycle : {};
  const evidence = isObject(entry.evidence) ? entry.evidence : {};
  const disposition = isObject(entry.j2_disposition)
    ? entry.j2_disposition
    : {};
  const candidateStatus = candidate.status;
  const exactBindings = [
    evidence.capability_version,
    evidence.package_digest,
    evidence.adapter_digest,
  ].every(nonempty);
  const generationEligible =
    candidateStatus === "candidate" &&
    lifecycle.status === "active" &&
    evidence.state === "current" &&
    exactBindings;
  const ineligibilityReasons: string[] = [];
  if (candidateStatus !== "candidate") {
    ineligibilityReasons.push(
      "This lifecycle projection is not a current Capability candidate.",
    );
  }
  if (lifecycle.status !== "active") {
    ineligibilityReasons.push("Only active adapters are generation eligible.");
  }
  if (evidence.state !== "current" || !exactBindings) {
    ineligibilityReasons.push(
      "No complete current evidence with exact Capability and adapter bindings is available.",
    );
  }
  if (nonempty(evidence.reason) && !generationEligible) {
    ineligibilityReasons.push(evidence.reason);
  }

  return {
    inventory_entry: entry.id,
    provider: entry.provider,
    source: {
      ownership: source.ownership,
      location_class: source.location_class,
      path: source.path,
    },
    lifecycle_status: lifecycle.status,
    capability: {
      status: candidateStatus,
      id: candidateStatus === "candidate" ? candidate.id : null,
      authority: candidateStatus === "candidate" ? candidate.authority : null,
      reason: candidateStatus === "not-candidate" ? candidate.reason : null,
    },
    evidence: {
      state: evidence.state,
      as_of: evidence.as_of,
      capability_version: evidence.capability_version,
      package_digest: evidence.package_digest,
      adapter_digest: evidence.adapter_digest,
      reason: evidence.reason,
    },
    generation_eligible: generationEligible,
    ineligibility_reasons: ineligibilityReasons,
    j2_disposition: {
      action: disposition.action,
      rationale: disposition.rationale,
    },
  };
}

export function buildExpectedEligibility(
  interactiveInventory: unknown = readJson(INTERACTIVE_INVENTORY),
  headlessInventory: unknown = readJson(HEADLESS_INVENTORY),
): JsonObject {
  const entries = [
    ...inventoryEntries(interactiveInventory),
    ...inventoryEntries(headlessInventory),
  ]
    .map(projectEntry)
    .sort((left, right) =>
      String(left.inventory_entry).localeCompare(String(right.inventory_entry)),
    );
  const generationEligibleCount = entries.filter(
    (entry) => entry.generation_eligible === true,
  ).length;

  return {
    kind: "ProviderAdapterGenerationEligibility",
    schema_version: "1.0.0",
    as_of: GOVERNED_EVIDENCE_DATE,
    accepted_workspace_revision: ACCEPTED_WORKSPACE_REVISION,
    outcome:
      generationEligibleCount > 0
        ? "eligible-adapters-present"
        : "no-eligible-adapters",
    generation_eligible_count: generationEligibleCount,
    governed_outputs:
      generationEligibleCount > 0 ? GOVERNED_OUTPUTS : "none",
    current_entry_points: {
      classification:
        generationEligibleCount > 0
          ? "governed-staging-with-non-governed-migration-inputs"
          : "non-governed-migration-inputs",
      shared_guidance: "CONTEXT.md",
      provider_specific_guidance: ["CLAUDE.md", "AGENTS.md"],
      authored_adapter_root: ".claude/skills",
      generated_mirror_root: ".agents/skills",
      governed_staging_outputs:
        generationEligibleCount > 0 ? GOVERNED_OUTPUTS : "none",
      limitation:
        generationEligibleCount > 0
          ? "Governed outputs remain staged; existing handwritten and mirrored surfaces stay active migration inputs until the final J2 discovery cutover."
          : "Existing handwritten and mirrored surfaces are migration inputs, not W1-generated Provider Entry Points.",
    },
    entries,
    w1_refusal_contract: {
      script: "scripts/ops/prove-provider-entry-point-refusal.ts",
      expected_requirement: "WS-ENTRY-005",
      expected_outcome: "failed",
      output_policy: "The governed target must remain absent.",
    },
    j2_sequence: [
      "Choose one candidate Capability boundary.",
      "Confirm its accountable Capability Authority.",
      "Author the Capability Package at that authority.",
      "Implement or evaluate exact Provider Adapters.",
      "Collect digest-bound conformance evidence.",
      "Resolve an immutable Capability Registry Lock.",
      "Generate governed Provider Entry Points.",
    ],
  };
}

export function validateEligibility(
  eligibility: unknown,
  interactiveInventory: unknown = readJson(INTERACTIVE_INVENTORY),
  headlessInventory: unknown = readJson(HEADLESS_INVENTORY),
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isObject(eligibility)) {
    return [
      diagnostic(
        "TJ-GEN-001",
        "/",
        "Eligibility artifact must be a JSON object.",
      ),
    ];
  }

  const inventoryDiagnostics = [
    ...validateInventory(interactiveInventory),
    ...validateInventory(headlessInventory),
  ];
  if (inventoryDiagnostics.length > 0) {
    diagnostics.push(
      diagnostic(
        "TJ-GEN-002",
        "/entries",
        `Source inventories must validate first; found ${inventoryDiagnostics.length} diagnostic(s).`,
      ),
    );
  }

  for (const [inventoryKind, inventory] of [
    ["interactive", interactiveInventory],
    ["headless", headlessInventory],
  ] as const) {
    for (const entry of inventoryEntries(inventory)) {
      const id = nonempty(entry.id) ? entry.id : "unknown";
      const evidence = isObject(entry.evidence) ? entry.evidence : {};
      const bindingFields = [
        evidence.capability_version,
        evidence.package_digest,
        evidence.adapter_digest,
      ];
      const unavailableBinding =
        evidence.state === "unavailable" &&
        bindingFields.every((value) => value === null);
      const currentBinding =
        evidence.state === "current" && bindingFields.every(nonempty);
      if (!unavailableBinding && !currentBinding) {
        diagnostics.push(
          diagnostic(
            "TJ-GEN-006",
            `/source-inventories/${inventoryKind}/entries/${id}/evidence`,
            "Evidence must be either unavailable with null bindings or current with an exact Capability version, package digest, and adapter digest.",
          ),
        );
      }
    }
  }

  const expected = buildExpectedEligibility(
    interactiveInventory,
    headlessInventory,
  );
  const expectedEntries = Array.isArray(expected.entries)
    ? expected.entries.filter(isObject)
    : [];
  const actualEntries = Array.isArray(eligibility.entries)
    ? eligibility.entries.filter(isObject)
    : [];
  const expectedIds = expectedEntries
    .map((entry) => entry.inventory_entry)
    .filter(nonempty);
  const actualIds = actualEntries
    .map((entry) => entry.inventory_entry)
    .filter(nonempty);
  const missing = expectedIds.filter((id) => !actualIds.includes(id));
  const extra = actualIds.filter((id) => !expectedIds.includes(id));
  const duplicates = actualIds.filter(
    (id, index) => actualIds.indexOf(id) !== index,
  );
  if (missing.length > 0) {
    diagnostics.push(
      diagnostic(
        "TJ-GEN-003",
        "/entries",
        `Missing inventory entries: ${missing.join(", ")}.`,
      ),
    );
  }
  if (extra.length > 0) {
    diagnostics.push(
      diagnostic(
        "TJ-GEN-003",
        "/entries",
        `Unknown inventory entries: ${extra.join(", ")}.`,
      ),
    );
  }
  if (duplicates.length > 0) {
    diagnostics.push(
      diagnostic(
        "TJ-GEN-003",
        "/entries",
        `Duplicate inventory entries: ${[...new Set(duplicates)].join(", ")}.`,
      ),
    );
  }

  const actualById = new Map(
    actualEntries.map((entry) => [String(entry.inventory_entry), entry]),
  );
  for (const expectedEntry of expectedEntries) {
    const id = String(expectedEntry.inventory_entry);
    const actualEntry = actualById.get(id);
    if (
      actualEntry &&
      JSON.stringify(actualEntry) !== JSON.stringify(expectedEntry)
    ) {
      diagnostics.push(
        diagnostic(
          "TJ-GEN-004",
          `/entries/${id}`,
          "Eligibility entry must match its deterministic inventory projection.",
        ),
      );
    }
  }

  for (const field of [
    "kind",
    "schema_version",
    "as_of",
    "accepted_workspace_revision",
    "outcome",
    "generation_eligible_count",
    "governed_outputs",
    "current_entry_points",
    "w1_refusal_contract",
    "j2_sequence",
  ]) {
    if (
      JSON.stringify(eligibility[field]) !== JSON.stringify(expected[field])
    ) {
      diagnostics.push(
        diagnostic(
          "TJ-GEN-005",
          `/${field}`,
          `${field} must match the deterministic generation-eligibility projection.`,
        ),
      );
    }
  }

  return diagnostics;
}

function parseArgs(argv: string[]) {
  let format = "human";
  let artifactPath = DEFAULT_ELIGIBILITY;
  let printArtifact = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format") {
      format = argv[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length);
    } else if (arg === "--print-artifact") {
      printArtifact = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      artifactPath = resolve(arg);
    }
  }
  if (!["human", "json"].includes(format)) {
    throw new Error("--format must be human or json.");
  }
  return { format, artifactPath, printArtifact };
}

async function main() {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  if (args.printArtifact) {
    console.log(JSON.stringify(buildExpectedEligibility(), null, 2));
    return;
  }

  let eligibility: unknown;
  try {
    if (
      !existsSync(args.artifactPath) ||
      !statSync(args.artifactPath).isFile()
    ) {
      throw new Error("Eligibility artifact does not exist.");
    }
    eligibility = readJson(args.artifactPath);
  } catch (error) {
    const diagnostics = [
      diagnostic(
        "TJ-GEN-001",
        "/",
        error instanceof Error
          ? error.message
          : "Eligibility artifact is not readable JSON.",
      ),
    ];
    console.log(
      args.format === "json"
        ? JSON.stringify(
            {
              kind: "ProviderAdapterGenerationEligibilityValidation",
              schema_version: "1.0.0",
              outcome: "invalid",
              subject: relative(REPO_ROOT, args.artifactPath),
              diagnostics,
            },
            null,
            2,
          )
        : `Provider Adapter generation eligibility: invalid\n- [${diagnostics[0].requirement}] ${diagnostics[0].path}: ${diagnostics[0].message}`,
    );
    process.exit(1);
  }

  const diagnostics = validateEligibility(eligibility);
  const report = {
    kind: "ProviderAdapterGenerationEligibilityValidation",
    schema_version: "1.0.0",
    outcome: diagnostics.length === 0 ? "valid" : "invalid",
    subject: relative(REPO_ROOT, args.artifactPath),
    inventory_entries:
      isObject(eligibility) && Array.isArray(eligibility.entries)
        ? eligibility.entries.length
        : 0,
    generation_eligible_count: isObject(eligibility)
      ? eligibility.generation_eligible_count
      : null,
    diagnostics,
  };
  if (args.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Provider Adapter generation eligibility: ${report.outcome}`);
    console.log(`Subject: ${report.subject}`);
    console.log(`Inventory entries: ${report.inventory_entries}`);
    console.log(
      `Generation eligible: ${String(report.generation_eligible_count)}`,
    );
    for (const item of diagnostics) {
      console.log(`- [${item.requirement}] ${item.path}: ${item.message}`);
    }
  }
  process.exit(diagnostics.length === 0 ? 0 : 1);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
