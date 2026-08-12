import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type ObjectJson = { [key: string]: Json };
type ArtifactDigest = { path: string; sha256: string };

const ACCEPTANCE_COUNTS = {
  capabilities: 19,
  adapters: 38,
  inventoryEntries: 74,
  liveCutovers: 5,
} as const;

const root = process.cwd();

function readJson(path: string): ObjectJson {
  return JSON.parse(readFileSync(path, "utf8")) as ObjectJson;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function object(value: Json | undefined, name: string): ObjectJson {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function array(value: Json | undefined, name: string): Json[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function text(value: Json | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function collectArtifacts(value: Json, found: ArtifactDigest[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectArtifacts(item, found);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (typeof value.path === "string" && typeof value.sha256 === "string") {
    found.push({ path: value.path, sha256: value.sha256 });
  }
  for (const child of Object.values(value)) collectArtifacts(child, found);
}

export function validateJ2Acceptance(): string[] {
  const diagnostics: string[] = [];
  const receipt = readJson(resolve(root, "evidence/j2-acceptance.json"));
  const lock = readJson(resolve(root, "capability-registry-lock.json"));
  const projection = readJson(
    resolve(root, "docs/agents/provider-adapters/generation-eligibility.json"),
  );

  const releases = array(
    receipt.capability_releases,
    "capability_releases",
  ).map((value, index) => object(value, `capability_releases[${index}]`));
  const locked = array(lock.capabilities, "lock.capabilities").map(
    (value, index) => object(value, `lock.capabilities[${index}]`),
  );
  if (
    releases.length !== ACCEPTANCE_COUNTS.capabilities ||
    locked.length !== ACCEPTANCE_COUNTS.capabilities
  ) {
    diagnostics.push(
      `expected ${ACCEPTANCE_COUNTS.capabilities} releases and lock entries, found ${releases.length}/${locked.length}`,
    );
  }

  const releaseById = new Map(
    releases.map((release) => [text(release.id, "release.id"), release]),
  );
  const recordedAdapters = object(receipt.adapter_digests, "adapter_digests");
  const seenAdapters = new Set<string>();

  for (const entry of locked) {
    const id = text(entry.id, "lock capability id");
    const release = releaseById.get(id);
    if (!release) {
      diagnostics.push(`missing release ${id}`);
      continue;
    }
    const source = object(entry.source, `${id}.source`);
    const expected: Array<[string, Json | undefined, Json | undefined]> = [
      ["version", release.version, entry.approved_version],
      ["authority", release.authority, entry.authority],
      ["repository", release.repository, entry.repository],
      ["revision", release.revision, source.revision],
      ["package_digest", release.package_digest, entry.package_digest],
    ];
    for (const [field, actual, wanted] of expected) {
      if (actual !== wanted) {
        diagnostics.push(`${id} ${field} does not match the published lock`);
      }
    }

    const packageName = id.split("/").at(-1) ?? "";
    const evidenceRoot = id.startsWith("capability:scope:notes/")
      ? resolve(root, ".notes-source/capabilities", packageName)
      : resolve(root, "capabilities", packageName);
    for (const adapterValue of array(
      entry.provider_adapters,
      `${id}.provider_adapters`,
    )) {
      const adapter = object(adapterValue, `${id}.adapter`);
      const adapterId = text(adapter.id, `${id}.adapter.id`);
      const evidencePath = resolve(
        evidenceRoot,
        text(adapter.evidence, `${adapterId}.evidence`),
      );
      if (!existsSync(evidencePath)) {
        diagnostics.push(
          `missing exact evidence for ${adapterId}: ${evidencePath}`,
        );
        continue;
      }
      const evidence = readJson(evidencePath);
      const digest = text(
        evidence.adapter_digest,
        `${adapterId}.adapter_digest`,
      );
      if (recordedAdapters[adapterId] !== digest) {
        diagnostics.push(`${adapterId} digest does not match exact evidence`);
      }
      if (release.evidence_date !== evidence.validated_at) {
        diagnostics.push(
          `${adapterId} evidence date does not match the release record`,
        );
      }
      seenAdapters.add(adapterId);
    }
  }
  if (
    seenAdapters.size !== ACCEPTANCE_COUNTS.adapters ||
    Object.keys(recordedAdapters).length !== ACCEPTANCE_COUNTS.adapters
  ) {
    diagnostics.push(
      `expected ${ACCEPTANCE_COUNTS.adapters} exact adapter bindings, found ${seenAdapters.size}/${Object.keys(recordedAdapters).length}`,
    );
  }

  const inventory = object(
    receipt.inventory_reconciliation,
    "inventory_reconciliation",
  );
  const entries = array(projection.entries, "projection.entries").map(
    (value, index) => object(value, `projection.entries[${index}]`),
  );
  if (entries.length !== inventory.validated_j2_inventory) {
    diagnostics.push(
      "validated inventory count does not match the final projection",
    );
  }
  const interactive = readJson(
    resolve(root, "docs/agents/provider-adapters/interactive-inventory.json"),
  );
  const headless = readJson(
    resolve(root, "docs/agents/provider-adapters/headless-inventory.json"),
  );
  if (
    array(interactive.entries, "interactive.entries").length !==
    inventory.interactive
  ) {
    diagnostics.push(
      "interactive count does not match its exhaustive inventory",
    );
  }
  if (
    array(headless.entries, "headless.entries").length !== inventory.headless
  ) {
    diagnostics.push("headless count does not match its exhaustive inventory");
  }

  const j1Revision = text(
    inventory.historical_j1_revision,
    "historical_j1_revision",
  );
  const j1Path = text(
    inventory.historical_j1_projection_path,
    "historical_j1_projection_path",
  );
  let j1Projection: ObjectJson | undefined;
  try {
    const bytes = execFileSync("git", ["show", `${j1Revision}:${j1Path}`], {
      cwd: root,
    });
    if (
      createHash("sha256").update(bytes).digest("hex") !==
      inventory.historical_j1_projection_sha256
    ) {
      diagnostics.push("historical J1 projection digest is stale");
    }
    j1Projection = JSON.parse(bytes.toString("utf8")) as ObjectJson;
  } catch {
    diagnostics.push(
      "historical J1 projection cannot be reproduced from its exact revision",
    );
  }
  if (j1Projection) {
    const j1Ids = new Set(
      array(j1Projection.entries, "j1.entries").map((value) =>
        text(object(value, "j1.entry").inventory_entry, "j1.inventory_entry"),
      ),
    );
    const j2Ids = new Set(
      entries.map((entry) => text(entry.inventory_entry, "inventory_entry")),
    );
    const added = [...j2Ids].filter((id) => !j1Ids.has(id)).sort();
    const removed = [...j1Ids].filter((id) => !j2Ids.has(id)).sort();
    if (j1Ids.size !== inventory.historical_j1_requirement) {
      diagnostics.push(
        "historical J1 entry count does not match its requirement",
      );
    }
    if (
      JSON.stringify(added) !== JSON.stringify(inventory.added_entries_since_j1)
    ) {
      diagnostics.push("J1-to-J2 added-entry reconciliation is stale");
    }
    if (
      JSON.stringify(removed) !==
      JSON.stringify(inventory.removed_entries_since_j1)
    ) {
      diagnostics.push("J1-to-J2 removed-entry reconciliation is stale");
    }
  }
  if (projection.generation_eligible_count !== inventory.generation_eligible) {
    diagnostics.push(
      "generation-eligible count does not match the final projection",
    );
  }
  const dispositionCounts: Record<string, number> = {};
  for (const entry of entries) {
    const disposition = object(
      entry.final_disposition,
      "entry.final_disposition",
    );
    const state = text(disposition.state, "entry.final_disposition.state");
    dispositionCounts[state] = (dispositionCounts[state] ?? 0) + 1;
  }
  const recordedDispositions = object(
    inventory.final_dispositions,
    "final_dispositions",
  );
  for (const [state, count] of Object.entries(dispositionCounts)) {
    if (recordedDispositions[state] !== count) {
      diagnostics.push(
        `final disposition ${state} does not match the projection`,
      );
    }
  }

  const artifacts: ArtifactDigest[] = [];
  collectArtifacts(receipt, artifacts);
  const acceptanceRun = object(receipt.acceptance_run, "acceptance_run");
  const acceptanceRevision = text(
    acceptanceRun.trade_journal_revision,
    "acceptance_run.trade_journal_revision",
  );
  const workspaceRevision = text(
    acceptanceRun.workspace_revision,
    "acceptance_run.workspace_revision",
  );
  const workspaceCliBlob = text(
    acceptanceRun.workspace_cli_git_blob,
    "acceptance_run.workspace_cli_git_blob",
  );
  const workspaceLauncherDigest = text(
    acceptanceRun.workspace_launcher_sha256,
    "acceptance_run.workspace_launcher_sha256",
  );
  for (const artifact of artifacts) {
    const path = resolve(root, artifact.path);
    if (!existsSync(path)) {
      diagnostics.push(`recorded artifact is absent: ${artifact.path}`);
    } else if (sha256(path) !== artifact.sha256) {
      diagnostics.push(`recorded digest is stale: ${artifact.path}`);
    }
  }

  for (const value of Object.values(
    object(receipt.governance_artifacts, "governance_artifacts"),
  )) {
    const artifact = object(value, "governance artifact");
    const path = text(artifact.path, "governance artifact path");
    const digest = text(artifact.sha256, "governance artifact sha256");
    try {
      const bytes = execFileSync(
        "git",
        ["show", `${acceptanceRevision}:${path}`],
        {
          cwd: root,
        },
      );
      if (createHash("sha256").update(bytes).digest("hex") !== digest) {
        diagnostics.push(
          `acceptance revision does not contain the recorded bytes: ${path}`,
        );
      }
    } catch {
      diagnostics.push(`acceptance revision cannot reproduce: ${path}`);
    }
  }

  let launcherBytes: Buffer | undefined;
  try {
    launcherBytes = execFileSync(
      "git",
      ["show", `${acceptanceRevision}:workspace`],
      { cwd: root },
    );
    if (
      createHash("sha256").update(launcherBytes).digest("hex") !==
      workspaceLauncherDigest
    ) {
      diagnostics.push(
        "acceptance revision has a different Workspace launcher digest",
      );
    }
    const launcher = launcherBytes.toString("utf8");
    if (!launcher.includes(`accepted_revision="${workspaceRevision}"`)) {
      diagnostics.push("Workspace revision is not bound by the exact launcher");
    }
    if (!launcher.includes(`accepted_cli_blob="${workspaceCliBlob}"`)) {
      diagnostics.push("Workspace CLI blob is not bound by the exact launcher");
    }
  } catch {
    diagnostics.push(
      "Workspace launcher cannot be reproduced at the acceptance revision",
    );
  }

  const workspaceRoot = process.env.WORKSPACE_REPOSITORY_ROOT;
  if (workspaceRoot && existsSync(resolve(workspaceRoot, "workspace"))) {
    const checkout = mkdtempSync(resolve(tmpdir(), "j2-acceptance-"));
    try {
      execFileSync(
        "git",
        ["worktree", "add", "--detach", checkout, acceptanceRevision],
        {
          cwd: root,
          stdio: "ignore",
        },
      );
      const status = execFileSync("git", ["status", "--short"], {
        cwd: checkout,
        encoding: "utf8",
      });
      if (status !== "")
        diagnostics.push("exact acceptance checkout is not clean");
      execFileSync(
        resolve(checkout, "workspace"),
        ["validate", "repository", checkout, "--format", "json"],
        {
          cwd: checkout,
          env: { ...process.env, WORKSPACE_REPOSITORY_ROOT: workspaceRoot },
          stdio: "ignore",
        },
      );
    } catch {
      diagnostics.push(
        "public Workspace CLI did not validate the clean exact revision",
      );
    } finally {
      try {
        execFileSync("git", ["worktree", "remove", "--force", checkout], {
          cwd: root,
          stdio: "ignore",
        });
      } finally {
        rmSync(checkout, { recursive: true, force: true });
      }
    }
  }

  const cutovers = array(receipt.live_cutovers, "live_cutovers");
  if (cutovers.length !== ACCEPTANCE_COUNTS.liveCutovers) {
    diagnostics.push(
      `expected ${ACCEPTANCE_COUNTS.liveCutovers} live cutovers, found ${cutovers.length}`,
    );
  }
  for (const [index, value] of cutovers.entries()) {
    const cutover = object(value, `live_cutovers[${index}]`);
    for (const field of [
      "approval",
      "canary",
      "safeguards",
      "rollback",
      "evidence_date",
    ]) {
      text(cutover[field], `live_cutovers[${index}].${field}`);
    }
  }

  const external = array(
    receipt.external_authority_dispositions,
    "external_authority_dispositions",
  ).map((value, index) =>
    object(value, `external_authority_dispositions[${index}]`),
  );
  const externalCapabilities = new Set(
    external.flatMap((disposition) =>
      typeof disposition.capability === "string"
        ? [disposition.capability]
        : [],
    ),
  );
  const retainedExternalCapabilities = new Set(
    entries.flatMap((entry) => {
      const disposition = object(
        entry.final_disposition,
        "entry.final_disposition",
      );
      const capability = object(entry.capability, "entry.capability");
      return disposition.state === "retained" &&
        typeof capability.id === "string" &&
        capability.authority !== "scope:trade-journal"
        ? [capability.id]
        : [];
    }),
  );
  for (const capability of retainedExternalCapabilities) {
    if (!externalCapabilities.has(capability)) {
      diagnostics.push(
        `external retained disposition is missing: ${capability}`,
      );
    }
  }
  for (const capability of externalCapabilities) {
    if (!retainedExternalCapabilities.has(capability)) {
      diagnostics.push(
        `external Capability disposition is not inventory-backed: ${capability}`,
      );
    }
  }

  return diagnostics;
}

async function main(): Promise<void> {
  const json =
    process.argv.includes("--format") && process.argv.includes("json");
  const diagnostics = validateJ2Acceptance();
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          kind: "J2AcceptanceValidation",
          outcome: diagnostics.length === 0 ? "valid" : "invalid",
          diagnostics,
        },
        null,
        2,
      )}\n`,
    );
  } else if (diagnostics.length === 0) {
    process.stdout.write(
      `J2 acceptance record: valid\nCapabilities: ${ACCEPTANCE_COUNTS.capabilities}\nAdapters: ${ACCEPTANCE_COUNTS.adapters}\nInventory entries: ${ACCEPTANCE_COUNTS.inventoryEntries}\nLive cutovers: ${ACCEPTANCE_COUNTS.liveCutovers}\nDiagnostics: none\n`,
    );
  } else {
    process.stderr.write(
      `J2 acceptance record: invalid\n${diagnostics.map((item) => `- ${item}`).join("\n")}\n`,
    );
  }
  if (diagnostics.length > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
