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
  it("binds both exact adapters to the source-owned package", () => {
    for (const provider of ["claude", "codex"]) {
      const evidence = readJson(`evidence/${provider}.json`);

      expect(evidence.package_digest).toBe(digest("capability-package.json"));
      expect(evidence.adapter_digest).toBe(digest(`adapters/${provider}.md`));
      expect(evidence.support_state).toBe("current");
    }
  });

  it("routes through repository authority without copying workflow semantics", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read(`adapters/${provider}.md`);

      expect(adapter).toContain("docs/agents/provider-adapters/interactive-inventory.json");
      expect(adapter).toContain("capability-registry-lock.json");
      expect(adapter).toContain(`use its exact \`${provider}\` Provider Adapter`);
      expect(adapter).toContain("`.claude/skills/<name>/SKILL.md`");
      expect(adapter).toContain("Never route historical evidence");
    }
  });

  it("keeps discovery separate from workflow execution and machine state", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read(`adapters/${provider}.md`);
      expect(adapter).toContain("Discovery is read-only");
      expect(adapter).toContain("must not execute the selected workflow");
    }

    const codex = read("adapters/codex.md");
    expect(codex).toContain("bridge is optional bootstrap");
    expect(codex).toContain("is not owned by this repository");
    expect(codex).toContain("is not Adapter Conformance evidence");
  });
});
