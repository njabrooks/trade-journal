#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCEPTED_WORKSPACE_REVISION,
  GOVERNED_EVIDENCE_DATE,
} from "./validate-provider-generation-eligibility.js";

type JsonObject = Record<string, unknown>;

type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EXPIRED_EVIDENCE_TIME = "2026-09-06";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(path: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function run(
  command: string,
  args: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv = {},
): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function requireSuccess(result: CommandResult, operation: string) {
  if (result.status !== 0) {
    throw new Error(`${operation} failed: ${result.stderr || result.stdout}`);
  }
}

function parseJson(stdout: string, operation: string): JsonObject {
  try {
    const value: unknown = JSON.parse(stdout);
    if (!isObject(value)) throw new Error("result is not an object");
    return value;
  } catch (error) {
    throw new Error(
      `${operation} did not return JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function diagnosticsFrom(report: JsonObject): JsonObject[] {
  return Array.isArray(report.diagnostics)
    ? report.diagnostics.filter(isObject)
    : [];
}

function requirementsFrom(report: JsonObject): string[] {
  return diagnosticsFrom(report)
    .map((diagnostic) => diagnostic.requirement)
    .filter((requirement): requirement is string =>
      typeof requirement === "string"
    );
}

function hasExpiredEvidenceDiagnostic(
  report: JsonObject,
  requirement: "WS-AC-004" | "WS-ENTRY-003",
): boolean {
  return diagnosticsFrom(report).some(
    (diagnostic) =>
      diagnostic.requirement === requirement &&
      typeof diagnostic.message === "string" &&
      diagnostic.message.toLowerCase().includes("expired"),
  );
}

function parseArgs(argv: string[]) {
  let format = "human";
  let workspaceRoot = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--workspace-root") {
      workspaceRoot = resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--format") {
      format = argv[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!workspaceRoot) throw new Error("--workspace-root is required.");
  if (!["human", "json"].includes(format)) {
    throw new Error("--format must be human or json.");
  }
  return { format, workspaceRoot };
}

function createFreshnessFixture(root: string) {
  const authority = join(root, "authority-repository");
  const packageRoot = join(authority, "capabilities", "freshness-example");
  const adapterPath = join(packageRoot, "adapters", "codex.txt");
  const packagePath = join(packageRoot, "capability-package.json");
  const evidencePath = join(packageRoot, "evidence", "codex.json");
  mkdirSync(dirname(adapterPath), { recursive: true });
  writeFileSync(adapterPath, "controlled freshness codex adapter\n", "utf8");

  const capabilityId =
    "capability:scope:trade-journal-fixture/freshness-example";
  writeJson(packagePath, {
    id: capabilityId,
    authority: "scope:trade-journal-fixture",
    version: "1.0.0",
    intent: "Prove that expired evidence cannot authorize governed output.",
    contract:
      "Treat evidence evaluated after its expiry as stale before accepting or writing a Provider Entry Point.",
    instructions: [
      "Evaluate Adapter Conformance at the caller-supplied governed evidence time.",
    ],
    conformance: {
      evidence_validity_days: 30,
      requirements: [
        {
          id: "structure",
          category: "structural",
          description: "The adapter source exists.",
          evidence_type: "automated",
        },
        {
          id: "behaviour",
          category: "behavioural",
          description: "Expired evidence cannot authorize governed output.",
          evidence_type: "automated",
        },
        {
          id: "meaning",
          category: "semantic",
          description: "The adapter preserves the freshness contract.",
          evidence_type: "human",
        },
      ],
    },
    provider_adapters: [
      {
        id: "codex-freshness",
        provider: "codex",
        source: "adapters/codex.txt",
        evidence: "evidence/codex.json",
      },
    ],
    dependencies: [],
  });
  writeJson(evidencePath, {
    capability_id: capabilityId,
    capability_version: "1.0.0",
    package_digest: sha256(packagePath),
    adapter_id: "codex-freshness",
    adapter_digest: sha256(adapterPath),
    support_state: "current",
    validated_at: GOVERNED_EVIDENCE_DATE,
    results: {
      structure: { status: "passed" },
      behaviour: { status: "passed" },
      meaning: {
        status: "passed",
        reviewer: "Trade Journal governance fixture",
        method: "Compared the exact adapter with the controlled contract.",
        evidence_link: "https://example.test/evidence/freshness-example",
        expires_at: "2026-09-05",
      },
    },
  });

  const gitEnvironment = {
    GIT_AUTHOR_DATE: "2026-08-06T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-08-06T00:00:00Z",
  };
  for (const args of [
    ["init"],
    ["config", "user.name", "Trade Journal Freshness Fixture"],
    ["config", "user.email", "trade-journal-fixture@example.test"],
    ["config", "commit.gpgsign", "false"],
    ["add", "."],
    ["commit", "-m", "Publish freshness fixture"],
  ]) {
    requireSuccess(
      run("git", ["-C", authority, ...args], REPO_ROOT, gitEnvironment),
      `git ${args[0]}`,
    );
  }
  const revisionResult = run(
    "git",
    ["-C", authority, "rev-parse", "HEAD"],
    REPO_ROOT,
  );
  requireSuccess(revisionResult, "git rev-parse");

  const registry = join(root, "capability-registry.json");
  const lock = join(root, "capability-registry-lock.json");
  const reproducedLock = join(root, "reproduced-registry-lock.json");
  writeJson(registry, {
    version: "1.0.0",
    capabilities: [
      {
        id: capabilityId,
        authority: "scope:trade-journal-fixture",
        repository: "repository:fixture/freshness-example",
        package_path: "capabilities/freshness-example",
        approved_version: "1.0.0",
        release: {
          source: "authority-repository",
          revision: revisionResult.stdout.trim(),
        },
        development: {
          enabled: true,
          working_tree: "authority-repository",
        },
      },
    ],
  });

  const consumer = join(root, "consumer-repository");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, "CONTEXT.md"), "# Neutral guidance\n", "utf8");
  writeJson(join(consumer, "provider-entry-points.json"), {
    version: "1.0.0",
    neutral_guidance: ["CONTEXT.md"],
    providers: [{ provider: "codex", output: "GOVERNED-CODEX.md" }],
  });

  return {
    packageRoot,
    registry,
    lock,
    reproducedLock,
    consumer,
    output: join(consumer, "GOVERNED-CODEX.md"),
  };
}

function registryArgs(registry: string, lock: string, evidenceTime: string) {
  return [
    registry,
    "--lock",
    lock,
    "--mode",
    "published",
    "--evidence-time",
    evidenceTime,
    "--format",
    "json",
  ];
}

function entryPointArgs(
  consumer: string,
  registry: string,
  lock: string,
  evidenceTime: string,
) {
  return [
    "provider-entry-points",
    consumer,
    "--registry",
    registry,
    "--lock",
    lock,
    "--mode",
    "published",
    "--evidence-time",
    evidenceTime,
    "--format",
    "json",
  ];
}

async function main() {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  const cli = join(args.workspaceRoot, "workspace");
  const proofDiagnostics: Array<{ requirement: string; message: string }> = [];
  let report: JsonObject;
  let temporary = "";

  try {
    if (!existsSync(cli)) {
      throw new Error("Accepted Workspace CLI does not exist.");
    }
    const revision = run(
      "git",
      ["-C", args.workspaceRoot, "rev-parse", "HEAD"],
      REPO_ROOT,
    );
    requireSuccess(revision, "Workspace revision check");
    if (revision.stdout.trim() !== ACCEPTED_WORKSPACE_REVISION) {
      throw new Error(
        `Workspace checkout must be exact revision ${ACCEPTED_WORKSPACE_REVISION}.`,
      );
    }
    const worktree = run(
      "git",
      ["-C", args.workspaceRoot, "status", "--short"],
      REPO_ROOT,
    );
    requireSuccess(worktree, "Workspace cleanliness check");
    if (worktree.stdout.trim()) {
      throw new Error("Workspace checkout must be clean.");
    }

    temporary = mkdtempSync(join(tmpdir(), "trade-journal-w1-freshness-"));
    const fixture = createFreshnessFixture(temporary);

    const currentCapability = run(
      cli,
      [
        "validate",
        "capability",
        fixture.packageRoot,
        "--evidence-time",
        GOVERNED_EVIDENCE_DATE,
        "--format",
        "json",
      ],
      args.workspaceRoot,
    );
    requireSuccess(currentCapability, "Current Capability validation");

    const resolveLock = run(
      cli,
      [
        "resolve",
        "registry",
        ...registryArgs(
          fixture.registry,
          fixture.lock,
          GOVERNED_EVIDENCE_DATE,
        ),
      ],
      args.workspaceRoot,
    );
    requireSuccess(resolveLock, "Registry Lock resolution");

    const validateLock = run(
      cli,
      [
        "validate",
        "registry-lock",
        ...registryArgs(
          fixture.registry,
          fixture.lock,
          GOVERNED_EVIDENCE_DATE,
        ),
      ],
      args.workspaceRoot,
    );
    requireSuccess(validateLock, "Registry Lock validation");

    const reproduceLock = run(
      cli,
      [
        "resolve",
        "registry",
        ...registryArgs(
          fixture.registry,
          fixture.reproducedLock,
          GOVERNED_EVIDENCE_DATE,
        ),
      ],
      args.workspaceRoot,
    );
    requireSuccess(reproduceLock, "Registry Lock reproduction");
    const lockByteIdentical =
      readFileSync(fixture.lock).equals(readFileSync(fixture.reproducedLock));

    const generateCurrent = run(
      cli,
      [
        "generate",
        ...entryPointArgs(
          fixture.consumer,
          fixture.registry,
          fixture.lock,
          GOVERNED_EVIDENCE_DATE,
        ),
      ],
      args.workspaceRoot,
    );
    requireSuccess(generateCurrent, "Current Provider Entry Point generation");
    const validateCurrent = run(
      cli,
      [
        "validate",
        ...entryPointArgs(
          fixture.consumer,
          fixture.registry,
          fixture.lock,
          GOVERNED_EVIDENCE_DATE,
        ),
      ],
      args.workspaceRoot,
    );
    requireSuccess(validateCurrent, "Current Provider Entry Point validation");

    const staleCapabilityResult = run(
      cli,
      [
        "validate",
        "capability",
        fixture.packageRoot,
        "--evidence-time",
        EXPIRED_EVIDENCE_TIME,
        "--format",
        "json",
      ],
      args.workspaceRoot,
    );
    const staleCapability = parseJson(
      staleCapabilityResult.stdout,
      "Expired Capability validation",
    );
    const adapters = Array.isArray(staleCapability.adapters)
      ? staleCapability.adapters.filter(isObject)
      : [];
    const adapterState = String(adapters[0]?.state ?? "unknown");
    const capabilityExpiredEvidenceDiagnostic = hasExpiredEvidenceDiagnostic(
      staleCapability,
      "WS-AC-004",
    );

    const staleValidationResult = run(
      cli,
      [
        "validate",
        ...entryPointArgs(
          fixture.consumer,
          fixture.registry,
          fixture.lock,
          EXPIRED_EVIDENCE_TIME,
        ),
      ],
      args.workspaceRoot,
    );
    const staleValidation = parseJson(
      staleValidationResult.stdout,
      "Expired Provider Entry Point validation",
    );
    const validationExpiredEvidenceDiagnostic = hasExpiredEvidenceDiagnostic(
      staleValidation,
      "WS-ENTRY-003",
    );

    rmSync(fixture.output);
    const staleGenerationResult = run(
      cli,
      [
        "generate",
        ...entryPointArgs(
          fixture.consumer,
          fixture.registry,
          fixture.lock,
          EXPIRED_EVIDENCE_TIME,
        ),
      ],
      args.workspaceRoot,
    );
    const staleGeneration = parseJson(
      staleGenerationResult.stdout,
      "Expired Provider Entry Point generation",
    );
    const generationExpiredEvidenceDiagnostic = hasExpiredEvidenceDiagnostic(
      staleGeneration,
      "WS-ENTRY-003",
    );
    const outputAbsent = !existsSync(fixture.output);

    if (!lockByteIdentical) {
      proofDiagnostics.push({
        requirement: "TJ-FRESH-001",
        message:
          "Registry Lock reproduction must remain byte-identical at its governed evidence time.",
      });
    }
    if (
      staleCapabilityResult.status !== 1 ||
      adapterState !== "stale" ||
      !capabilityExpiredEvidenceDiagnostic
    ) {
      proofDiagnostics.push({
        requirement: "TJ-FRESH-002",
        message:
          "Capability evidence evaluated after expiry must exit 1 with adapter state stale.",
      });
    }
    if (
      staleValidationResult.status !== 1 ||
      !validationExpiredEvidenceDiagnostic
    ) {
      proofDiagnostics.push({
        requirement: "TJ-FRESH-003",
        message:
          "Expired evidence must prevent a governed Provider Entry Point from being accepted.",
      });
    }
    if (
      staleGenerationResult.status !== 1 ||
      !generationExpiredEvidenceDiagnostic ||
      !outputAbsent
    ) {
      proofDiagnostics.push({
        requirement: "TJ-FRESH-004",
        message:
          "Expired evidence must fail generation before a governed output is written.",
      });
    }

    report = {
      kind: "EvidenceFreshnessRefusalProof",
      schema_version: "1.0.0",
      outcome: proofDiagnostics.length === 0 ? "passed" : "failed",
      accepted_workspace_revision: ACCEPTED_WORKSPACE_REVISION,
      lock_reproduction: {
        evidence_time: GOVERNED_EVIDENCE_DATE,
        byte_identical: lockByteIdentical,
      },
      freshness_evaluation: {
        evidence_time: EXPIRED_EVIDENCE_TIME,
        adapter_state: adapterState,
        expired_evidence_diagnostic: capabilityExpiredEvidenceDiagnostic,
        exit_code: staleCapabilityResult.status,
        requirements: requirementsFrom(staleCapability),
      },
      governed_output: {
        validation_rejected: staleValidationResult.status === 1,
        validation_expired_evidence_diagnostic:
          validationExpiredEvidenceDiagnostic,
        validation_requirements: requirementsFrom(staleValidation),
        generation_rejected: staleGenerationResult.status === 1,
        generation_expired_evidence_diagnostic:
          generationExpiredEvidenceDiagnostic,
        generation_requirements: requirementsFrom(staleGeneration),
        absent_after_generation: outputAbsent,
      },
      diagnostics: proofDiagnostics,
    };
  } catch (error) {
    report = {
      kind: "EvidenceFreshnessRefusalProof",
      schema_version: "1.0.0",
      outcome: "failed",
      accepted_workspace_revision: ACCEPTED_WORKSPACE_REVISION,
      diagnostics: [
        {
          requirement: "TJ-FRESH-000",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }

  if (args.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Evidence freshness refusal proof: ${String(report.outcome)}`);
    console.log(`Workspace revision: ${ACCEPTED_WORKSPACE_REVISION}`);
    if (isObject(report.lock_reproduction)) {
      console.log(
        `Registry Lock byte-identical: ${String(report.lock_reproduction.byte_identical)}`,
      );
    }
    if (isObject(report.freshness_evaluation)) {
      console.log(
        `Expired adapter state: ${String(report.freshness_evaluation.adapter_state)}`,
      );
    }
    if (isObject(report.governed_output)) {
      console.log(
        `Governed output absent: ${String(report.governed_output.absent_after_generation)}`,
      );
    }
    for (const diagnostic of proofDiagnostics) {
      console.log(`- [${diagnostic.requirement}] ${diagnostic.message}`);
    }
  }
  process.exit(report.outcome === "passed" ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
