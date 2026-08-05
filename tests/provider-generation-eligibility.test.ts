import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildExpectedEligibility,
  validateEligibility,
} from "../scripts/ops/validate-provider-generation-eligibility";

const artifactPath = resolve(
  process.cwd(),
  "docs/agents/provider-adapters/generation-eligibility.json",
);

function readArtifact(): Record<string, unknown> {
  return JSON.parse(readFileSync(artifactPath, "utf8")) as Record<
    string,
    unknown
  >;
}

function readInventory(
  name: "interactive" | "headless",
): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        `docs/agents/provider-adapters/${name}-inventory.json`,
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

describe("Provider Adapter generation eligibility", () => {
  it("accepts the checked-in deterministic zero-eligibility artifact", () => {
    const artifact = readArtifact();

    expect(validateEligibility(artifact)).toEqual([]);
    expect(artifact.outcome).toBe("no-eligible-adapters");
    expect(artifact.generation_eligible_count).toBe(0);
    expect(artifact.governed_outputs).toBe("none");
    expect(artifact.entries).toHaveLength(73);
  });

  it("rebuilds the checked-in artifact byte-for-byte", () => {
    expect(JSON.stringify(buildExpectedEligibility(), null, 2)).toBe(
      JSON.stringify(readArtifact(), null, 2),
    );
  });

  it("reports a stable coverage diagnostic when an inventory entry is omitted", () => {
    const artifact = readArtifact();
    artifact.entries = (
      artifact.entries as Array<Record<string, unknown>>
    ).slice(1);

    expect(validateEligibility(artifact)).toContainEqual({
      requirement: "TJ-GEN-003",
      path: "/entries",
      message: "Missing inventory entries: headless-codex-advance-or-kill.",
    });
  });

  it("rejects an evidence upgrade that is not present in the source inventory", () => {
    const artifact = readArtifact();
    const entries = artifact.entries as Array<Record<string, unknown>>;
    const evidence = entries[0].evidence as Record<string, unknown>;
    evidence.state = "current";

    expect(validateEligibility(artifact)).toContainEqual({
      requirement: "TJ-GEN-004",
      path: `/entries/${String(entries[0].inventory_entry)}`,
      message:
        "Eligibility entry must match its deterministic inventory projection.",
    });
  });

  it("rejects fabricated current bindings in a source inventory", () => {
    const interactive = readInventory("interactive");
    const headless = readInventory("headless");
    const entries = interactive.entries as Array<Record<string, unknown>>;
    const evidence = entries[0].evidence as Record<string, unknown>;
    evidence.state = "current";
    evidence.capability_version = "9.9.9";
    evidence.package_digest = "sha256:fabricated-package";
    evidence.adapter_digest = "sha256:fabricated-adapter";

    expect(
      validateEligibility(readArtifact(), interactive, headless),
    ).toContainEqual({
      requirement: "TJ-GEN-006",
      path: `/source-inventories/interactive/entries/${String(entries[0].id)}/evidence`,
      message:
        "J1 requires state unavailable, as_of 2026-08-04, null Capability/adapter bindings, and a non-empty reason.",
    });
  });

  it("rejects any non-zero generation eligibility claim", () => {
    const artifact = readArtifact();
    artifact.generation_eligible_count = 1;

    expect(validateEligibility(artifact)).toContainEqual({
      requirement: "TJ-GEN-005",
      path: "/generation_eligible_count",
      message:
        "generation_eligible_count must match the deterministic zero-eligibility contract.",
    });
  });
});
