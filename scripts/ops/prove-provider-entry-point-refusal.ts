#!/usr/bin/env tsx

import { createHash } from "node:crypto";
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
import { spawnSync } from "node:child_process";
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
  if (!["human", "json"].includes(format))
    throw new Error("--format must be human or json.");
  return { format, workspaceRoot };
}

function createUnavailableFixture(root: string) {
  const authority = join(root, "authority-repository");
  const packageRoot = join(authority, "capabilities", "unavailable-example");
  const adapterPath = join(packageRoot, "adapters", "codex.txt");
  const packagePath = join(packageRoot, "capability-package.json");
  const evidencePath = join(packageRoot, "evidence", "codex.json");
  mkdirSync(dirname(adapterPath), { recursive: true });
  writeFileSync(adapterPath, "controlled unavailable codex adapter\n", "utf8");

  const capabilityId =
    "capability:scope:trade-journal-fixture/unavailable-example";
  writeJson(packagePath, {
    id: capabilityId,
    authority: "scope:trade-journal-fixture",
    version: "1.0.0",
    intent:
      "Exercise W1 refusal of an environmentally unavailable Provider Adapter.",
    contract:
      "Never project unavailable support as a governed Provider Entry Point.",
    instructions: [
      "Return unavailable when the required provider environment is absent.",
    ],
    conformance: {
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
          description: "The adapter follows the declared contract.",
          evidence_type: "automated",
        },
        {
          id: "meaning",
          category: "semantic",
          description: "The adapter preserves provider-neutral meaning.",
          evidence_type: "automated",
        },
        {
          id: "environment",
          category: "environmental",
          description: "The eligible provider environment exists.",
          evidence_type: "automated",
        },
      ],
    },
    provider_adapters: [
      {
        id: "codex-unavailable",
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
    adapter_id: "codex-unavailable",
    adapter_digest: sha256(adapterPath),
    support_state: "unavailable",
    limitations: [
      "The controlled provider environment is intentionally unavailable.",
    ],
    validated_at: GOVERNED_EVIDENCE_DATE,
    results: {
      structure: { status: "passed" },
      behaviour: { status: "passed" },
      meaning: { status: "passed" },
      environment: { status: "unavailable" },
    },
  });

  const gitEnvironment = {
    GIT_AUTHOR_DATE: "2026-08-04T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-08-04T00:00:00Z",
  };
  for (const args of [
    ["init"],
    ["config", "user.name", "Trade Journal W1 Refusal Fixture"],
    ["config", "user.email", "trade-journal-fixture@example.test"],
    ["config", "commit.gpgsign", "false"],
    ["add", "."],
    ["commit", "-m", "Publish unavailable fixture"],
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
  const revision = revisionResult.stdout.trim();

  const registry = join(root, "capability-registry.json");
  const lock = join(root, "capability-registry-lock.json");
  writeJson(registry, {
    version: "1.0.0",
    capabilities: [
      {
        id: capabilityId,
        authority: "scope:trade-journal-fixture",
        repository: "repository:fixture/unavailable-example",
        package_path: "capabilities/unavailable-example",
        approved_version: "1.0.0",
        release: { source: authority, revision },
        development: { enabled: true, working_tree: authority },
      },
    ],
  });

  const consumer = join(root, "consumer-repository");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    join(consumer, "CONTEXT.md"),
    "# Controlled neutral guidance\n",
    "utf8",
  );
  writeJson(join(consumer, "provider-entry-points.json"), {
    version: "1.0.0",
    neutral_guidance: ["CONTEXT.md"],
    providers: [{ provider: "codex", output: "GOVERNED-CODEX.md" }],
  });
  return {
    consumer,
    registry,
    lock,
    output: join(consumer, "GOVERNED-CODEX.md"),
  };
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
  const diagnostics: Array<{ requirement: string; message: string }> = [];
  let report: JsonObject;
  let temporary = "";
  try {
    if (!existsSync(cli))
      throw new Error("Accepted Workspace CLI does not exist.");
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
    if (worktree.stdout.trim())
      throw new Error("Workspace checkout must be clean.");

    temporary = mkdtempSync(join(tmpdir(), "trade-journal-w1-refusal-"));
    const fixture = createUnavailableFixture(temporary);
    const resolveResult = run(
      cli,
      [
        "resolve",
        "registry",
        fixture.registry,
        "--lock",
        fixture.lock,
        "--mode",
        "published",
        "--evidence-time",
        GOVERNED_EVIDENCE_DATE,
        "--format",
        "json",
      ],
      args.workspaceRoot,
    );
    requireSuccess(resolveResult, "Registry resolution");
    const resolution = parseJson(resolveResult.stdout, "Registry resolution");

    const generationArgs = [
      "generate",
      "provider-entry-points",
      fixture.consumer,
      "--registry",
      fixture.registry,
      "--lock",
      fixture.lock,
      "--mode",
      "published",
      "--evidence-time",
      GOVERNED_EVIDENCE_DATE,
      "--format",
      "json",
    ];
    const first = run(cli, generationArgs, args.workspaceRoot);
    const outputAbsentAfterFirst = !existsSync(fixture.output);
    const second = run(cli, generationArgs, args.workspaceRoot);
    const outputAbsentAfterSecond = !existsSync(fixture.output);
    const generation = parseJson(
      first.stdout,
      "Provider Entry Point generation",
    );
    const generationDiagnostics = Array.isArray(generation.diagnostics)
      ? generation.diagnostics.filter(isObject)
      : [];
    const requirements = generationDiagnostics
      .map((item) => item.requirement)
      .filter((value): value is string => typeof value === "string");

    if (first.status !== 1 || second.status !== 1) {
      diagnostics.push({
        requirement: "TJ-GEN-PROOF-001",
        message:
          "W1 generation must exit 1 for unavailable support on both runs.",
      });
    }
    if (!requirements.includes("WS-ENTRY-005")) {
      diagnostics.push({
        requirement: "TJ-GEN-PROOF-002",
        message:
          "W1 generation must report WS-ENTRY-005 for unavailable support.",
      });
    }
    if (generation.outcome !== "failed") {
      diagnostics.push({
        requirement: "TJ-GEN-PROOF-005",
        message:
          "W1 generation outcome must be failed for unavailable support.",
      });
    }
    if (!outputAbsentAfterFirst || !outputAbsentAfterSecond) {
      diagnostics.push({
        requirement: "TJ-GEN-PROOF-003",
        message: "W1 generation must leave the governed target absent.",
      });
    }
    if (first.stdout !== second.stdout || first.stderr !== second.stderr) {
      diagnostics.push({
        requirement: "TJ-GEN-PROOF-004",
        message: "Repeated W1 refusal diagnostics must be byte-identical.",
      });
    }

    report = {
      kind: "ProviderEntryPointRefusalProof",
      schema_version: "1.0.0",
      outcome: diagnostics.length === 0 ? "passed" : "failed",
      accepted_workspace_revision: ACCEPTED_WORKSPACE_REVISION,
      evidence_time: GOVERNED_EVIDENCE_DATE,
      registry_resolution: {
        outcome: resolution.outcome,
        publication_eligible: resolution.publication_eligible,
      },
      generation: {
        outcome: generation.outcome,
        exit_code: first.status,
        requirements,
        repeated_diagnostics_byte_identical:
          first.stdout === second.stdout && first.stderr === second.stderr,
        governed_output_absent:
          outputAbsentAfterFirst && outputAbsentAfterSecond,
      },
      diagnostics,
    };
  } catch (error) {
    report = {
      kind: "ProviderEntryPointRefusalProof",
      schema_version: "1.0.0",
      outcome: "failed",
      accepted_workspace_revision: ACCEPTED_WORKSPACE_REVISION,
      evidence_time: GOVERNED_EVIDENCE_DATE,
      diagnostics: [
        {
          requirement: "TJ-GEN-PROOF-000",
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
    console.log(
      `Provider Entry Point refusal proof: ${String(report.outcome)}`,
    );
    console.log(`Workspace revision: ${ACCEPTED_WORKSPACE_REVISION}`);
    if (isObject(report.generation)) {
      console.log(
        `W1 requirement: ${String((report.generation.requirements as string[])[0])}`,
      );
      console.log(
        `Repeated diagnostics byte-identical: ${String(report.generation.repeated_diagnostics_byte_identical)}`,
      );
      console.log(
        `Governed output absent: ${String(report.generation.governed_output_absent)}`,
      );
    }
    const reportDiagnostics = Array.isArray(report.diagnostics)
      ? report.diagnostics.filter(isObject)
      : [];
    for (const item of reportDiagnostics) {
      console.log(`- [${String(item.requirement)}] ${String(item.message)}`);
    }
  }
  process.exit(report.outcome === "passed" ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
