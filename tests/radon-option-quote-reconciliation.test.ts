import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RADON_REVISION = "0e88af93c31471c093dbd61bc80c386ab8da38de";
const QUOTE_CAPABILITY = "capability:scope:radon/ibkr-option-quote";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

function inventoryEntry(path: string, id: string): Record<string, unknown> {
  const inventory = readJson(path);
  return (inventory.entries as Array<Record<string, unknown>>).find(
    (candidate) => candidate.id === id,
  )!;
}

describe("Radon-owned IBKR option quote reconciliation", () => {
  it("records the unavailable external package at an immutable Radon revision", () => {
    const receipt = readJson("evidence/issue-74-radon-option-quote-reconciliation.json");

    expect(receipt).toMatchObject({
      kind: "RadonOptionQuoteReconciliation",
      issue: "njabrooks/trade-journal#74",
      fixed_point: "b1107701bce30ec78bf067c05f07e97b37624cf2",
      disposition: "retained-unavailable",
      radon_authority: {
        repository: "github:njabrooks/radon",
        immutable_review_revision: RADON_REVISION,
        immutable_tree: "4b09dfc6fdc216b3b8ee354a06a625fc91994982",
        capability_id: QUOTE_CAPABILITY,
        accepted_package: "unavailable",
        capability_version: null,
        package_digest: null,
        adapter_digest: null,
        evidence: "unavailable",
        reviewed_source_digests: {
          "AGENTS.md":
            "sha256:444620d91ddba9c18bc9960fc308db0062c3ce869c71c3972a5961bb93d924b2",
          "CLAUDE.md":
            "sha256:31d18d0f975c1ee95f019ff4fba6bfe8ef97a2d04153c0ed83ddf2070c868f77",
          "scripts/clients/ib_client.py":
            "sha256:e2606518a84d81e44e8b694850e3b795fb77a5df52a50f1834be1c02cec48256",
        },
      },
      radon_review: {
        remote_revision_tree_inspected: true,
        capability_package_present: false,
        capability_registry_present: false,
        adapter_conformance_evidence_present: false,
        repository_work_items_selecting_a_release: [],
        local_worktree_mutated: false,
      },
      scope_confirmation: {
        radon_worktree_mutated: false,
        gateway_operation_invoked: false,
        market_data_requested: false,
        credentials_read: false,
        active_discovery_changed: false,
        scheduler_changed: false,
        database_write: false,
        trade_authority_acquired: false,
        successor_work_started: false,
      },
    });

    for (const artifact of [
      readJson("capability-registry.json"),
      readJson("capability-registry-lock.json"),
    ]) {
      expect(
        (artifact.capabilities as Array<Record<string, unknown>>).some(
          (candidate) => candidate.id === QUOTE_CAPABILITY,
        ),
      ).toBe(false);
    }
  });

  it("retains both projections as unavailable without moving Radon authority", () => {
    const interactive = inventoryEntry(
      "docs/agents/provider-adapters/interactive-inventory.json",
      "interactive-claude-ibkr-quote",
    );
    const headless = inventoryEntry(
      "docs/agents/provider-adapters/headless-inventory.json",
      "headless-codex-ibkr-quote",
    );

    for (const projection of [interactive, headless]) {
      expect(projection).toMatchObject({
        candidate_capability: {
          status: "candidate",
          id: QUOTE_CAPABILITY,
          authority: "scope:radon",
        },
        lifecycle: {
          status: "active",
          protective_tombstone: false,
        },
        evidence: {
          state: "unavailable",
          as_of: "2026-08-11",
          capability_version: null,
          package_digest: null,
          adapter_digest: null,
          reason:
            "Radon publishes no accepted immutable option-quote Capability Package or exact Adapter Conformance evidence at the reviewed revision.",
        },
        j2_disposition: {
          action: "retain-temporarily",
          rationale:
            "Retain the bounded non-governed requested-contract quote boundary until Radon publishes an accepted immutable package; do not infer support from gateway connectivity, market-data availability, or local files.",
        },
      });
    }

    expect(interactive).toMatchObject({
      invocation: {
        mode: "interactive",
        unattended_eligibility: "ineligible",
      },
      authority_and_write_scope: {
        writes:
          "No Trade Journal database writes; any explicit gateway lifecycle action is delegated to the separately governed gateway controller.",
      },
    });
    expect(headless).toMatchObject({
      execution_contract: {
        class: "bespoke",
        preamble_path: ".claude/skills/ibkr-quote/HEADLESS_PREAMBLE.md",
        readiness:
          "Protective zero-read/zero-write unavailable refusal only; it grants no gateway, qualification, market-data, or quote authority.",
      },
      invocation: {
        unattended_eligibility: "ineligible",
      },
      authority_and_write_scope: {
        reads: "No reads permitted by the unavailable headless refusal.",
        writes: "No writes, gateway operations, contract requests, or market-data requests permitted.",
        judgment: "No unattended quote or execution judgment permitted.",
      },
    });
  });

  it("binds unchanged inputs while keeping chain, qualification, gateway, and quote roles explicit", () => {
    const receipt = readJson("evidence/issue-74-radon-option-quote-reconciliation.json");
    const inputs = receipt.migration_inputs as Record<string, Record<string, unknown>>;
    const boundaries = receipt.responsibility_boundaries as Record<
      string,
      Record<string, unknown>
    >;

    expect(boundaries).toMatchObject({
      bulk_chain: {
        path: "scripts/ingest-ibkr-chains.py",
        lifecycle: "retained-unchanged-separate-ingestion-path",
      },
      contract_qualification: {
        path: "scripts/lib/ibkr_option_quote_boundary.py",
        owner: "scope:radon",
        lifecycle: "separate-requested-contract-adapter-boundary",
      },
      gateway_control: {
        path: "scripts/ops/gateway.sh",
        lifecycle: "retained-unchanged-separate-controller",
      },
      requested_structure_quote: {
        path: "scripts/ibkr-option-quote.py",
        lifecycle: "repaired-unavailable-and-client-id-boundary",
      },
      requested_contract_batch_quote: {
        path: "scripts/ibkr-quote-contracts.py",
        lifecycle: "repaired-structured-unavailable-boundary",
      },
      legacy_client_portal_quote: {
        path: "scripts/ibkr-option-quote.ts",
        lifecycle: "deprecated-retained-unchanged",
      },
    });

    for (const input of Object.values(inputs)) {
      if (typeof input.path !== "string" || typeof input.sha256 !== "string") continue;
      const digest = createHash("sha256")
        .update(readFileSync(resolve(process.cwd(), input.path)))
        .digest("hex");
      expect(digest).toBe(input.sha256);
    }

    expect(read("scripts/ingest-ibkr-chains.py")).toContain("reqSecDefOptParams");
    for (const quoteHelper of [
      read("scripts/ibkr-option-quote.py"),
      read("scripts/ibkr-quote-contracts.py"),
    ]) {
      expect(quoteHelper).toContain("qualify_requested_option");
      expect(quoteHelper).not.toContain("qualifyContracts");
      expect(quoteHelper).not.toContain("reqSecDefOptParams");
    }
    expect(read("scripts/ibkr-option-quote.ts")).toContain("DEPRECATED (2026-07-10)");

    const interactiveSkill = read(".claude/skills/ibkr-quote/SKILL.md");
    expect(interactiveSkill).not.toContain("scripts/ops/gateway.sh resume");
    expect(interactiveSkill).not.toContain("lsof -i :4001");
    expect(interactiveSkill).toContain("separate `/gateway` workflow");
  });

  it("declares unavailable gateway and market data without attempting either headlessly", () => {
    const preamble = read(".claude/skills/ibkr-quote/HEADLESS_PREAMBLE.md");
    const expectedResult =
      '{"status":"unavailable","capability":"capability:scope:radon/ibkr-option-quote","reason":"accepted-radon-package-and-adapter-conformance-unavailable","reads":[],"writes":[],"gateway_operation_invoked":false,"market_data_requested":false}';

    expect(preamble).toContain(expectedResult);
    expect(preamble).toContain("Do not inspect local gateway");
    expect(preamble).toContain("Do not run any Trade Journal or Radon quote helper");
    expect(preamble).toMatch(/Do not qualify contracts\s+or request market data/);

    const receipt = readJson("evidence/issue-74-radon-option-quote-reconciliation.json");
    expect(receipt).toMatchObject({
      unavailable_behavior: {
        headless: "deterministic-zero-read-zero-write-refusal",
        missing_gateway: "unavailable-no-quote-result",
        missing_market_data: "unavailable-no-complete-quote-result",
        availability_evidence: "unavailable-not-inferred-or-simulated",
      },
    });
  });

  it("runs the option quote reconciliation proof in Workspace governance CI", () => {
    const workflow = read(".github/workflows/workspace-conformance.yml");
    expect(
      workflow.match(/tests\/radon-option-quote-reconciliation\.test\.ts/g),
    ).toHaveLength(3);

    const inventoryGuide = read("docs/agents/provider-adapters/README.md");
    expect(inventoryGuide).toContain("`gateway`, `ibkr-quote`, and `visser-scan`");
    expect(inventoryGuide).toContain("other 13 projections");
  });
});
