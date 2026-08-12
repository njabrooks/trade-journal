import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const capabilityRoot = resolve(root, "capabilities/thesis-foreground");
const workspaceRoot = process.env.WORKSPACE_REPOSITORY_ROOT;
const workspaceEvidenceTime = process.env.WORKSPACE_EVIDENCE_TIME ?? "2026-08-12";
const governanceIt = workspaceRoot ? it : it.skip;

function read(path: string): string {
  return readFileSync(resolve(capabilityRoot, path), "utf8");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

function digest(path: string): string {
  return `sha256:${createHash("sha256").update(read(path)).digest("hex")}`;
}

function repositoryDigest(path: string): string {
  return `sha256:${createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex")}`;
}

function inventoryEntry(path: string, id: string): Record<string, unknown> {
  const inventory = JSON.parse(
    readFileSync(resolve(root, path), "utf8"),
  ) as { entries: Array<Record<string, unknown>> };
  return inventory.entries.find((entry) => entry.id === id)!;
}

describe("thesis-foreground Capability", () => {
  it("binds both exact adapters to current complete evidence", () => {
    const packageDigest = digest("capability-package.json");

    for (const provider of ["claude", "codex"]) {
      const evidence = readJson(`evidence/${provider}.json`);
      const results = evidence.results as Record<string, { status: string }>;

      expect(evidence.package_digest).toBe(packageDigest);
      expect(evidence.adapter_digest).toBe(digest(`adapters/${provider}.md`));
      expect(evidence.support_state).toBe("current");
      expect(Object.values(results).every(({ status }) => status === "passed")).toBe(true);
    }
  });

  it("orchestrates exactly the three accepted governed dependencies", () => {
    const capabilityPackage = readJson("capability-package.json");
    const dependencies = capabilityPackage.dependencies as Array<{
      id: string;
      version_constraint: string;
    }>;

    expect(dependencies).toEqual([
      {
        id: "capability:scope:trade-journal/thesis-observation",
        version_constraint: ">=1.0.0 <2.0.0",
      },
      {
        id: "capability:scope:trade-journal/thesis-underwriting",
        version_constraint: ">=1.0.0 <2.0.0",
      },
      {
        id: "capability:scope:trade-journal/belief-evidence-assessment",
        version_constraint: ">=1.0.0 <2.0.0",
      },
    ]);
  });

  it("preserves the single-thesis foreground verbs and complete-input fences", () => {
    const capabilityPackage = readJson("capability-package.json");
    const contract = String(capabilityPackage.contract);
    const instructions = capabilityPackage.instructions as string[];
    const joined = instructions.join("\n");

    expect(contract).toContain("one explicit macro or asset thesis");
    expect(contract).toContain("Query and what-changed are read-only");
    expect(contract).toContain("interactive-only");
    expect(joined).toContain("one explicit foreground verb and one explicit macro or asset thesis");
    expect(joined).toContain("If no articulation exists");
    expect(joined).toContain("thin.unlinkedClaimCount is non-zero");
    expect(joined).toContain("current user explicitly requests recording");
    expect(joined).toContain("This foreground adapter has no direct database authority");
  });

  it("keeps both provider adapters externally equivalent and provider-specific", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read(`adapters/${provider}.md`);

      for (const verb of ["query", "what-changed", "observe", "assess-evidence", "re-underwrite"]) {
        expect(adapter).toContain(verb);
      }
      for (const dependency of ["thesis-observation", "thesis-underwriting", "belief-evidence-assessment"]) {
        expect(adapter).toContain(`capability:scope:trade-journal/${dependency}`);
      }
      expect(adapter).toContain("thin.unlinkedClaimCount");
      expect(adapter).toContain("Both verbs are read-only");
      expect(adapter).toContain("scripts/ops/thesis-delta.ts");
      expect(adapter).toContain("expected-articulation-id");
      expect(adapter).toContain("no direct database authority");
      expect(adapter).toContain("must never be declared unattended-current");
      expect(adapter).toContain("schedule or launchd definition");
    }

    expect(read("adapters/codex.md")).toContain("repository command runner");
    expect(read("adapters/codex.md")).toContain("Do not substitute the machine-local bridge");
    expect(read("adapters/claude.md")).toContain("exact Claude adapters");
  });

  it("keeps the user-invocable skill a thin governed foreground shim", () => {
    const skill = readFileSync(resolve(root, ".claude/skills/thesis/SKILL.md"), "utf8");

    expect(skill).toContain("thin interactive migration shim");
    expect(skill).toContain("capabilities/thesis-foreground/adapters/claude.md");
    expect(skill).toContain("scripts/ops/thesis-delta.ts");
    expect(skill).toContain("must not capture observations directly");
    expect(skill).toContain("propose or execute options/trades as a foreground verb");
    expect(skill).not.toContain("scripts/options-advisor.ts");
    expect(skill).not.toContain("scripts/ops/raise-decision.ts");
    expect(skill).not.toContain("scripts/ops/capture-observation.ts");
  });

  it("uses a byte-identical unconditional zero-read zero-write headless refusal", () => {
    const claudePreamble = readFileSync(
      resolve(root, ".claude/skills/thesis/HEADLESS_PREAMBLE.md"),
      "utf8",
    );
    const codexPreamble = readFileSync(
      resolve(root, ".agents/skills/thesis/HEADLESS_PREAMBLE.md"),
      "utf8",
    );

    expect(codexPreamble).toBe(claudePreamble);
    expect(codexPreamble).toContain("unconditional refusal");
    expect(codexPreamble).toContain("Do not inspect a thesis");
    expect(codexPreamble).toContain("There are no permitted unattended parameters, reads, writes");
    expect(codexPreamble).toContain(
      '{"success":false,"skill":"thesis","status":"refused","reason":"interactive_thesis_judgment_required","writes":[]}',
    );
    expect(codexPreamble).not.toContain("proceed with your best judgment");
    expect(codexPreamble).not.toContain("surface decisions");
  });

  it("reconciles current inventory evidence without granting unattended eligibility", () => {
    expect(
      inventoryEntry(
        "docs/agents/provider-adapters/interactive-inventory.json",
        "interactive-claude-thesis",
      ),
    ).toMatchObject({
      source: { path: "capabilities/thesis-foreground/adapters/claude.md" },
      packaging: "governed-provider-adapter",
      invocation: { mode: "interactive", unattended_eligibility: "ineligible" },
      evidence: { state: "current", capability_version: "1.0.0" },
    });
    expect(
      inventoryEntry(
        "docs/agents/provider-adapters/headless-inventory.json",
        "headless-codex-thesis",
      ),
    ).toMatchObject({
      source: { path: "capabilities/thesis-foreground/adapters/codex.md" },
      packaging: "governed-provider-adapter",
      execution_contract: {
        class: "bespoke",
        preamble_path: ".claude/skills/thesis/HEADLESS_PREAMBLE.md",
      },
      invocation: { mode: "headless", unattended_eligibility: "ineligible" },
      authority_and_write_scope: {
        reads: expect.stringContaining("No unattended reads"),
        writes: expect.stringContaining("No unattended writes"),
      },
      evidence: { state: "current", capability_version: "1.0.0" },
    });
  });

  it("records deterministic publication artifacts and unchanged operational scope", () => {
    const receipt = JSON.parse(
      readFileSync(resolve(root, "evidence/issue-61-thesis-foreground.json"), "utf8"),
    ) as Record<string, Record<string, unknown>>;

    expect(receipt.published_artifacts).toMatchObject({
      registry_lock: repositoryDigest("capability-registry-lock.json"),
      claude_staging: repositoryDigest("docs/agents/provider-entry-points/staging/claude.md"),
      codex_staging: repositoryDigest("docs/agents/provider-entry-points/staging/codex.md"),
      interactive_inventory: repositoryDigest("docs/agents/provider-adapters/interactive-inventory.json"),
      headless_inventory: repositoryDigest("docs/agents/provider-adapters/headless-inventory.json"),
      generation_eligibility: repositoryDigest("docs/agents/provider-adapters/generation-eligibility.json"),
      inventory_entries: 74,
      generation_eligible_entries: 58,
    });
    expect(receipt.scope).toMatchObject({
      active_discovery_changed: false,
      scheduler_or_launchd_changed: false,
      live_provider_invoked: false,
      database_or_investment_state_changed: false,
      credentials_changed: false,
      cross_repository_write: false,
      trade_or_order_authority: false,
    });
  });

  governanceIt(
    "validates the exact package and staged projections through the public Workspace CLI",
    () => {
      const environment = {
        ...process.env,
        WORKSPACE_REPOSITORY_ROOT: workspaceRoot,
      };
      const capability = JSON.parse(
        execFileSync(
          "./workspace",
          [
            "validate",
            "capability",
            "capabilities/thesis-foreground",
            "--evidence-time",
            workspaceEvidenceTime,
            "--format",
            "json",
          ],
          { cwd: root, encoding: "utf8", env: environment },
        ),
      ) as { outcome: string; adapters: Array<{ state: string }> };
      const entryPoints = JSON.parse(
        execFileSync(
          "./workspace",
          [
            "validate",
            "provider-entry-points",
            ".",
            "--registry",
            "capability-registry.json",
            "--lock",
            "capability-registry-lock.json",
            "--mode",
            "published",
            "--evidence-time",
            workspaceEvidenceTime,
            "--format",
            "json",
          ],
          { cwd: root, encoding: "utf8", env: environment },
        ),
      ) as { outcome: string; outputs: Array<{ provider: string }> };

      expect(capability.outcome).toBe("valid");
      expect(capability.adapters.map(({ state }) => state)).toEqual([
        "current",
        "current",
      ]);
      expect(entryPoints.outcome).toBe("valid");
      expect(entryPoints.outputs.map(({ provider }) => provider)).toEqual([
        "claude",
        "codex",
      ]);
    },
  );
});
