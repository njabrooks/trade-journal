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
      expect(adapter).toContain("no direct database authority");
      expect(adapter).toContain("must never be declared unattended-current");
      expect(adapter).toContain("schedule or launchd definition");
    }

    expect(read("adapters/codex.md")).toContain("repository command runner");
    expect(read("adapters/codex.md")).toContain("Do not substitute the machine-local bridge");
    expect(read("adapters/claude.md")).toContain("exact Claude adapters");
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
