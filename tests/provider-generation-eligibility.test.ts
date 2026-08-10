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
  it("accepts the checked-in deterministic governed slices", () => {
    const artifact = readArtifact();

    expect(validateEligibility(artifact)).toEqual([]);
    expect(artifact.outcome).toBe("eligible-adapters-present");
    expect(artifact.generation_eligible_count).toBe(32);
    expect(artifact.governed_outputs).toEqual([
      "docs/agents/provider-entry-points/staging/claude.md",
      "docs/agents/provider-entry-points/staging/codex.md",
    ]);
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

  it("rejects an unsupported evidence state in a source inventory", () => {
    const interactive = readInventory("interactive");
    const headless = readInventory("headless");
    const entries = interactive.entries as Array<Record<string, unknown>>;
    const evidence = entries[0].evidence as Record<string, unknown>;
    evidence.state = "partial";

    expect(
      validateEligibility(readArtifact(), interactive, headless),
    ).toContainEqual({
      requirement: "TJ-GEN-006",
      path: `/source-inventories/interactive/entries/${String(entries[0].id)}/evidence`,
      message:
        "Evidence must be either unavailable with null bindings or current with an exact Capability version, package digest, and adapter digest.",
    });
  });

  it("rejects a generation eligibility count that diverges from inventory evidence", () => {
    const artifact = readArtifact();
    artifact.generation_eligible_count = 3;

    expect(validateEligibility(artifact)).toContainEqual({
      requirement: "TJ-GEN-005",
      path: "/generation_eligible_count",
      message:
        "generation_eligible_count must match the deterministic generation-eligibility projection.",
    });
  });
});
