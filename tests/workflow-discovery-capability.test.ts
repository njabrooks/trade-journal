import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const capabilityRoot = resolve(process.cwd(), "capabilities/workflow-discovery");

function read(path: string): string {
  return readFileSync(resolve(capabilityRoot, path), "utf8");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

function digest(path: string): string {
  return `sha256:${createHash("sha256").update(read(path)).digest("hex")}`;
}

describe("workflow-discovery Capability", () => {
  it("binds the exact Codex adapter to the source-owned package", () => {
    const evidence = readJson("evidence/codex.json");

    expect(evidence.package_digest).toBe(digest("capability-package.json"));
    expect(evidence.adapter_digest).toBe(digest("adapters/codex.md"));
    expect(evidence.support_state).toBe("current");
  });

  it("routes through repository authority without copying workflow semantics", () => {
    const adapter = read("adapters/codex.md");

    expect(adapter).toContain("docs/agents/provider-adapters/interactive-inventory.json");
    expect(adapter).toContain("capability-registry-lock.json");
    expect(adapter).toContain("use its exact `codex` Provider Adapter");
    expect(adapter).toContain("Read the exact `.claude/skills/<name>/SKILL.md` body");
    expect(adapter).toContain("Never route historical evidence");
  });

  it("keeps discovery separate from workflow execution and machine state", () => {
    const adapter = read("adapters/codex.md");

    expect(adapter).toContain("Discovery is read-only");
    expect(adapter).toContain("must not execute the selected workflow");
    expect(adapter).toContain("bridge is optional bootstrap");
    expect(adapter).toContain("is not owned by this repository");
    expect(adapter).toContain("is not Adapter Conformance evidence");
  });
});
