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
    expect(codex).toContain("optional non-authoritative bootstrap");
    expect(codex).toContain("cannot override this governed inventory route");
    expect(codex).toContain("is not owned by this repository");
    expect(codex).toContain("has unavailable Adapter Conformance evidence");
  });

  it("binds both interactive inventory entries and keeps the bridge non-gating", () => {
    const inventory = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "docs/agents/provider-adapters/interactive-inventory.json",
        ),
        "utf8",
      ),
    ) as {
      entries: Array<Record<string, unknown>>;
      discovery_surfaces: Array<Record<string, unknown>>;
    };

    for (const provider of ["claude", "codex"]) {
      const id =
        provider === "claude"
          ? "interactive-claude-workflow-discovery"
          : "interactive-codex-trade-journal-bridge";
      const entry = inventory.entries.find((candidate) => candidate.id === id)!;
      expect(entry.packaging).toBe("governed-provider-adapter");
      expect(entry.source).toEqual({
        ownership: "repository:njabrooks/trade-journal",
        location_class: "repository",
        path: `capabilities/workflow-discovery/adapters/${provider}.md`,
      });
      expect(entry.evidence).toMatchObject({
        state: "current",
        capability_version: "1.0.1",
        package_digest: digest("capability-package.json"),
        adapter_digest: digest(`adapters/${provider}.md`),
      });
    }

    const bridge = inventory.discovery_surfaces.find(
      (surface) => surface.id === "codex-legacy-router",
    )!;
    expect(bridge).toMatchObject({
      location_class: "external-bridge",
      path: "~/.codex/skills/trade-journal-workflows/SKILL.md",
    });

    const parity = readFileSync(
      resolve(process.cwd(), "scripts/ops/check-codex-parity.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(process.cwd(), "scripts/ops/hooks/pre-commit"),
      "utf8",
    );
    expect(parity).toContain("checked: false");
    expect(parity).toContain("gating: false");
    expect(parity).not.toContain("from 'node:os'");
    expect(hook).toContain("--discovery-only");
    expect(hook).not.toContain("references/claude-inventory.md");
  });

  it("records exact deterministic publication artifacts and the no-write scope", () => {
    const receipt = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "evidence/issue-71-workflow-discovery.json"),
        "utf8",
      ),
    ) as Record<string, Record<string, unknown>>;
    const artifacts = receipt.published_artifacts;

    // These legacy field names belong to the immutable issue-71 receipt.
    expect(artifacts.registry_lock).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifacts.claude_staging).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifacts.codex_staging).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifacts.interactive_inventory).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifacts.headless_inventory).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifacts.generation_eligibility).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt.scope).toMatchObject({
      provider_operations: false,
      database_or_investment_writes: false,
      scheduler_or_credential_changes: false,
      cross_repository_writes: false,
      github_issue_74_modified: false,
      github_issue_75_modified: false,
      github_issue_104_modified: false,
    });
  });
});
