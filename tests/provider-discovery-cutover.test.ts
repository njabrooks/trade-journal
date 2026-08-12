import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as Record<
    string,
    unknown
  >;
}

function sha256(path: string): string {
  return createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex");
}

describe("issue #76 governed provider discovery cutover", () => {
  it("uses complete canonical whole-file outputs and removes staging authority", () => {
    const declaration = readJson("provider-entry-points.json");
    expect(declaration.providers).toEqual([
      {
        provider: "claude",
        output: "docs/agents/provider-entry-points/claude.md",
      },
      {
        provider: "codex",
        output: "docs/agents/provider-entry-points/codex.md",
      },
    ]);
    expect(
      existsSync(resolve(root, "docs/agents/provider-entry-points/staging")),
    ).toBe(false);
  });

  it("reconciles the historical 73-entry requirement against all 74 entries", () => {
    const projection = readJson(
      "docs/agents/provider-adapters/generation-eligibility.json",
    );
    const entries = projection.entries as Array<Record<string, unknown>>;
    const allowed = new Set([
      "governed",
      "replaced",
      "retained",
      "deferred",
      "retired",
      "tombstone",
      "unavailable",
    ]);
    expect(entries).toHaveLength(74);
    expect(new Set(entries.map((entry) => entry.inventory_entry)).size).toBe(74);
    for (const entry of entries) {
      const disposition = entry.final_disposition as Record<string, unknown>;
      expect(allowed.has(String(disposition.state))).toBe(true);
      expect(String(disposition.rationale).length).toBeGreaterThan(0);
    }
  });

  it("binds acceptance evidence to the exact inventories and outputs", () => {
    const receipt = readJson("evidence/issue-76-provider-discovery-cutover.json");
    const artifacts = receipt.inventory_artifacts as Record<
      string,
      Record<string, string>
    >;
    const outputs = receipt.governed_outputs as Record<
      string,
      Record<string, string> | string
    >;
    for (const artifact of Object.values(artifacts)) {
      expect(sha256(artifact.path)).toBe(artifact.sha256);
    }
    for (const key of ["declaration", "claude", "codex"]) {
      const artifact = outputs[key] as Record<string, string>;
      expect(sha256(artifact.path)).toBe(artifact.sha256);
    }
  });
});
