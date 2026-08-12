import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type ObjectJson = { [key: string]: Json };

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

function collectArtifacts(
  value: Json,
  found: Array<{ path: string; sha256: string }>,
): void {
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

  const releases = array(receipt.capability_releases, "capability_releases").map(
    (value, index) => object(value, `capability_releases[${index}]`),
  );
  const locked = array(lock.capabilities, "lock.capabilities").map(
    (value, index) => object(value, `lock.capabilities[${index}]`),
  );
  if (releases.length !== 19 || locked.length !== 19) {
    diagnostics.push(
      `expected 19 releases and lock entries, found ${releases.length}/${locked.length}`,
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
        diagnostics.push(`missing exact evidence for ${adapterId}: ${evidencePath}`);
        continue;
      }
      const evidence = readJson(evidencePath);
      const digest = text(evidence.adapter_digest, `${adapterId}.adapter_digest`);
      if (recordedAdapters[adapterId] !== digest) {
        diagnostics.push(`${adapterId} digest does not match exact evidence`);
      }
      if (release.evidence_date !== evidence.validated_at) {
        diagnostics.push(`${adapterId} evidence date does not match the release record`);
      }
      seenAdapters.add(adapterId);
    }
  }
  if (seenAdapters.size !== 38 || Object.keys(recordedAdapters).length !== 38) {
    diagnostics.push(
      `expected 38 exact adapter bindings, found ${seenAdapters.size}/${Object.keys(recordedAdapters).length}`,
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
    diagnostics.push("validated inventory count does not match the final projection");
  }
  if (projection.generation_eligible_count !== inventory.generation_eligible) {
    diagnostics.push("generation-eligible count does not match the final projection");
  }
  const dispositionCounts: Record<string, number> = {};
  for (const entry of entries) {
    const disposition = object(entry.final_disposition, "entry.final_disposition");
    const state = text(disposition.state, "entry.final_disposition.state");
    dispositionCounts[state] = (dispositionCounts[state] ?? 0) + 1;
  }
  const recordedDispositions = object(
    inventory.final_dispositions,
    "final_dispositions",
  );
  for (const [state, count] of Object.entries(dispositionCounts)) {
    if (recordedDispositions[state] !== count) {
      diagnostics.push(`final disposition ${state} does not match the projection`);
    }
  }

  const artifacts: Array<{ path: string; sha256: string }> = [];
  collectArtifacts(receipt, artifacts);
  for (const artifact of artifacts) {
    const path = resolve(root, artifact.path);
    if (!existsSync(path)) {
      diagnostics.push(`recorded artifact is absent: ${artifact.path}`);
    } else if (sha256(path) !== artifact.sha256) {
      diagnostics.push(`recorded digest is stale: ${artifact.path}`);
    }
  }

  const cutovers = array(receipt.live_cutovers, "live_cutovers");
  if (cutovers.length !== 5) {
    diagnostics.push(`expected five live cutovers, found ${cutovers.length}`);
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

  return diagnostics;
}

function runCli(): void {
  const json = process.argv.includes("--format") && process.argv.includes("json");
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
      "J2 acceptance record: valid\nCapabilities: 19\nAdapters: 38\nInventory entries: 74\nLive cutovers: 5\nDiagnostics: none\n",
    );
  } else {
    process.stderr.write(
      `J2 acceptance record: invalid\n${diagnostics.map((item) => `- ${item}`).join("\n")}\n`,
    );
  }
  if (diagnostics.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
