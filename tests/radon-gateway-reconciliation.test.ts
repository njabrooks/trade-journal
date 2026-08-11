import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RADON_REVISION = "0e88af93c31471c093dbd61bc80c386ab8da38de";
const GATEWAY_CAPABILITY = "capability:scope:radon/ibkr-gateway-control";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as Record<
    string,
    unknown
  >;
}

function inventoryEntry(path: string, id: string): Record<string, unknown> {
  const inventory = readJson(path);
  return (inventory.entries as Array<Record<string, unknown>>).find(
    (candidate) => candidate.id === id,
  )!;
}

describe("Radon-owned IBKR gateway reconciliation", () => {
  it("records the unavailable external package at an immutable Radon revision", () => {
    const receipt = readJson("evidence/issue-73-radon-gateway-reconciliation.json");

    expect(receipt).toMatchObject({
      kind: "RadonGatewayReconciliation",
      issue: "njabrooks/trade-journal#73",
      fixed_point: "ee2547e47be0da3e5f759f7ebba4d5edc8a3f34a",
      disposition: "retained-unavailable",
      radon_authority: {
        repository: "github:njabrooks/radon",
        immutable_review_revision: RADON_REVISION,
        capability_id: GATEWAY_CAPABILITY,
        accepted_package: "unavailable",
        capability_version: null,
        package_digest: null,
      },
      operational_boundary: {
        gateway_manager: "radon-ibc-launchd",
        trade_journal_client_id_range: "20-49",
        interactive_control_retained: true,
        headless_control_eligible: false,
        live_gateway_state: "unavailable-not-inferred",
      },
      scope_confirmation: {
        radon_worktree_mutated: false,
        gateway_operation_invoked: false,
        credentials_read: false,
        active_discovery_changed: false,
        scheduler_changed: false,
        database_write: false,
        trade_authority_acquired: false,
        successor_work_started: false,
      },
    });

    const registry = readJson("capability-registry.json");
    const lock = readJson("capability-registry-lock.json");
    for (const artifact of [registry, lock]) {
      expect(
        (artifact.capabilities as Array<Record<string, unknown>>).some(
          (candidate) => candidate.id === GATEWAY_CAPABILITY,
        ),
      ).toBe(false);
    }
  });

  it("retains both projections as unavailable without moving Radon authority", () => {
    const interactive = inventoryEntry(
      "docs/agents/provider-adapters/interactive-inventory.json",
      "interactive-claude-gateway",
    );
    const headless = inventoryEntry(
      "docs/agents/provider-adapters/headless-inventory.json",
      "headless-codex-gateway",
    );

    for (const projection of [interactive, headless]) {
      expect(projection).toMatchObject({
        candidate_capability: {
          status: "candidate",
          id: GATEWAY_CAPABILITY,
          authority: "scope:radon",
        },
        lifecycle: {
          status: "active",
          protective_tombstone: false,
        },
        evidence: {
          state: "unavailable",
          as_of: "2026-08-10",
          capability_version: null,
          package_digest: null,
          adapter_digest: null,
          reason:
            "Radon publishes no accepted immutable gateway-control Capability Package or exact Adapter Conformance evidence at the reviewed revision.",
        },
        j2_disposition: {
          action: "retain-temporarily",
          rationale:
            "Retain the bounded non-governed gateway boundary until Radon publishes an accepted immutable package; do not infer support from connectivity or local files.",
        },
      });
    }

    expect(interactive).toMatchObject({
      invocation: {
        mode: "interactive",
        unattended_eligibility: "ineligible",
      },
      authority_and_write_scope: {
        writes: "Can pause, resume, or switch the live gateway profile.",
      },
    });
    expect(headless).toMatchObject({
      execution_contract: {
        class: "bespoke",
        preamble_path: ".claude/skills/gateway/HEADLESS_PREAMBLE.md",
        readiness:
          "Protective zero-read/zero-write unavailable refusal only; it grants no gateway-control authority.",
      },
      invocation: {
        unattended_eligibility: "ineligible",
      },
      authority_and_write_scope: {
        reads: "No reads permitted by the unavailable headless refusal.",
        writes: "No writes or gateway operations permitted.",
        judgment: "No unattended operational judgment permitted.",
      },
    });
  });

  it("preserves the accepted interactive controller and client-id boundary", () => {
    const receipt = readJson("evidence/issue-73-radon-gateway-reconciliation.json");
    const migrationInputs = receipt.migration_inputs as Record<
      string,
      Record<string, unknown>
    >;

    expect(migrationInputs.interactive_claude).toMatchObject({
      path: ".claude/skills/gateway/SKILL.md",
      sha256: "04a83eee5d6adb94e1aba83f5610f9528f8730ddb635d265de78c1d1e3a4dd02",
    });
    expect(migrationInputs.gateway_controller).toMatchObject({
      path: "scripts/ops/gateway.sh",
      sha256: "7c5f7fbf8ce5057c5c516f262202b720ff2a87867db978e57d9d0d0330eb1e33",
    });

    for (const input of Object.values(migrationInputs)) {
      if (typeof input.path !== "string" || typeof input.sha256 !== "string") continue;
      const digest = createHash("sha256")
        .update(readFileSync(resolve(process.cwd(), input.path)))
        .digest("hex");
      expect(digest).toBe(input.sha256);
    }

    expect(readFileSync(resolve(process.cwd(), "AGENTS.md"), "utf8")).toContain(
      "range **20–49**",
    );
    expect(
      readFileSync(
        resolve(process.cwd(), "docs/v2/21-radon-integration-options-strategy-surface.md"),
        "utf8",
      ),
    ).toContain("client_id 20-49");
  });

  it("refuses unattended gateway control with a deterministic no-read/no-write result", () => {
    const preamble = readFileSync(
      resolve(process.cwd(), ".claude/skills/gateway/HEADLESS_PREAMBLE.md"),
      "utf8",
    );
    expect(preamble).toContain('"status":"unavailable"');
    expect(preamble).toContain('"reads":[]');
    expect(preamble).toContain('"writes":[]');
    expect(preamble).toContain('"gateway_operation_invoked":false');
    expect(preamble).toMatch(/Do not run\s+`scripts\/ops\/gateway\.sh`/);
  });

  it("runs the gateway reconciliation proof in Workspace governance CI", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/workspace-conformance.yml"),
      "utf8",
    );
    expect(workflow.match(/tests\/radon-gateway-reconciliation\.test\.ts/g)).toHaveLength(
      3,
    );

    const inventoryGuide = readFileSync(
      resolve(process.cwd(), "docs/agents/provider-adapters/README.md"),
      "utf8",
    );
    expect(inventoryGuide).toContain("`gateway`, `ibkr-quote`, and `visser-scan`");
    expect(inventoryGuide).toContain("other 14 projections");
  });
});
