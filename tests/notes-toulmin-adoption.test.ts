import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const NOTES_REVISION = "04ea4f13d40a7c868ce43490d2a7e3ac440a026e";
const NOTES_PACKAGE = "capability:scope:notes/content-processing";
const NOTES_PACKAGE_DIGEST =
  "sha256:cbc56e1e943cfdfc2585592b4284e2640ce53ac0aaad9325913a5de78224881f";
const NOTES_ADAPTER_DIGESTS = {
  claude:
    "sha256:60fefe2dd5fff691582166fde0655d8c58155b7cfe956405aa320f19df3c9511",
  codex:
    "sha256:0e8460c2e6948fdff9b45862f26be6e251520909db678ba938c8691ea513eac0",
} as const;

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as Record<
    string,
    unknown
  >;
}

function entry(
  inventory: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  return (inventory.entries as Array<Record<string, unknown>>).find(
    (candidate) => candidate.id === id,
  )!;
}

describe("Notes-owned Toulmin extraction adoption", () => {
  it("resolves the accepted Notes package and its exact dependencies from one immutable revision", () => {
    const registry = readJson("capability-registry.json");
    const lock = readJson("capability-registry-lock.json");
    const registryEntries = registry.capabilities as Array<Record<string, unknown>>;
    const lockedEntries = lock.capabilities as Array<Record<string, unknown>>;

    for (const id of [
      NOTES_PACKAGE,
      "capability:scope:notes/pdf-transcript",
      "capability:scope:notes/tana-client",
    ]) {
      const authored = registryEntries.find((candidate) => candidate.id === id)!;
      expect(authored).toMatchObject({
        authority: "scope:notes",
        repository: "github:njabrooks/notes",
        approved_version: "0.2.0",
        release: {
          source: ".notes-source",
          revision: NOTES_REVISION,
        },
      });

      const locked = lockedEntries.find((candidate) => candidate.id === id)!;
      expect(locked).toMatchObject({
        authority: "scope:notes",
        repository: "github:njabrooks/notes",
        approved_version: "0.2.0",
        source: {
          revision: NOTES_REVISION,
          release_reference: NOTES_REVISION,
        },
      });
    }

    const contentProcessing = lockedEntries.find(
      (candidate) => candidate.id === NOTES_PACKAGE,
    )!;
    expect(contentProcessing.package_digest).toBe(NOTES_PACKAGE_DIGEST);
    expect(contentProcessing.dependencies).toEqual([
      {
        id: "capability:scope:notes/tana-client",
        version_constraint: ">=0.2.0 <1.0.0",
      },
      {
        id: "capability:scope:notes/pdf-transcript",
        version_constraint: ">=0.2.0 <1.0.0",
      },
    ]);
  });

  it("replaces all four legacy projections with exact federated adapter bindings", () => {
    const interactive = readJson(
      "docs/agents/provider-adapters/interactive-inventory.json",
    );
    const headless = readJson(
      "docs/agents/provider-adapters/headless-inventory.json",
    );

    for (const [inventory, id, provider] of [
      [interactive, "interactive-claude-process-note", "claude"],
      [interactive, "interactive-claude-process-transcript", "claude"],
      [headless, "headless-codex-process-note", "codex"],
      [headless, "headless-codex-process-transcript", "codex"],
    ] as const) {
      const projection = entry(inventory, id);
      expect(projection).toMatchObject({
        candidate_capability: {
          status: "candidate",
          id: NOTES_PACKAGE,
          authority: "scope:notes",
        },
        source: {
          ownership: "repository:njabrooks/notes",
          location_class: "external-bridge",
          path: `github:njabrooks/notes@${NOTES_REVISION}:capabilities/content-processing/adapters/${provider}.md`,
        },
        packaging: "governed-provider-adapter",
        evidence: {
          state: "current",
          as_of: "2026-08-10",
          capability_version: "0.2.0",
          package_digest: NOTES_PACKAGE_DIGEST,
          adapter_digest: NOTES_ADAPTER_DIGESTS[provider],
        },
        j2_disposition: {
          action: "replace",
        },
        federated_binding: {
          registry_path: "capability-registry.json",
          lock_path: "capability-registry-lock.json",
          capability_id: NOTES_PACKAGE,
          adapter_id: `notes-content-processing-${provider}`,
        },
      });
      expect(projection.migration_input).toBeDefined();
    }
  });

  it("records unavailable live operation without acquiring Notes or investment-write authority", () => {
    const receipt = readJson("evidence/issue-72-notes-toulmin-adoption.json");
    expect(receipt).toMatchObject({
      kind: "NotesToulminAdoption",
      issue: "njabrooks/trade-journal#72",
      fixed_point: "6291b10bbd6bbda21d8c8a013b826ae7afd0ba37",
      notes_authority: {
        repository: "github:njabrooks/notes",
        accepted_default_branch_revision:
          "596556cea1e84b064f334b640bb30d78a2a06fbf",
        immutable_release_revision: NOTES_REVISION,
        capability_id: NOTES_PACKAGE,
        capability_version: "0.2.0",
        package_digest: NOTES_PACKAGE_DIGEST,
      },
      operational_evidence: {
        live_tana_execution: "unavailable-not-exercised",
        production_writes: 0,
        live_interactive_consumer_present: true,
        live_headless_consumer_present: false,
        live_scheduled_consumer_present: false,
      },
      authority_boundaries: {
        notes: "capture-source-material-thinking-and-toulmin-extraction",
        trade_journal: "promoted-investment-entities-only",
      },
      scope_confirmation: {
        notes_worktree_mutated: false,
        active_discovery_changed: false,
        scheduler_changed: false,
        credential_used: false,
        database_write: false,
        trade_authority_acquired: false,
        successor_work_started: false,
      },
    });

    const canonical = JSON.stringify(receipt, null, 2) + "\n";
    expect(`sha256:${createHash("sha256").update(canonical).digest("hex")}`).toBe(
      `sha256:${createHash("sha256")
        .update(readFileSync(resolve(process.cwd(), "evidence/issue-72-notes-toulmin-adoption.json")))
        .digest("hex")}`,
    );
  });
});
