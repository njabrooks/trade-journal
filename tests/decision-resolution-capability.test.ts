import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertExplicitUserJudgment,
  MISSING_USER_JUDGMENT_MESSAGE,
} from "../scripts/lib/decisionResolutionAuthority";

const capabilityRoot = resolve(process.cwd(), "capabilities/decision-resolution");

function read(path: string): string {
  return readFileSync(resolve(capabilityRoot, path), "utf8");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

function digest(path: string): string {
  return `sha256:${createHash("sha256").update(read(path)).digest("hex")}`;
}

describe("decision-resolution Capability", () => {
  it("binds both exact adapters to complete current evidence", () => {
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

  it("requires explicit current-user judgment and refuses missing or agent authority", () => {
    expect(() => assertExplicitUserJudgment({})).toThrow(
      MISSING_USER_JUDGMENT_MESSAGE,
    );
    expect(() => assertExplicitUserJudgment({ by: "agent" })).toThrow(
      MISSING_USER_JUDGMENT_MESSAGE,
    );
    expect(() => assertExplicitUserJudgment({ by: "user" })).not.toThrow();

    const resolver = readFileSync(
      resolve(process.cwd(), "scripts/ops/resolve-decision.ts"),
      "utf8",
    );
    expect(resolver.indexOf("assertExplicitUserJudgment(input)")).toBeLessThan(
      resolver.indexOf(".from(journalEntries)"),
    );
    expect(resolver).toContain("chosen_by: input.by");
    expect(resolver).toContain("actionType: 'decision_resolved'");
  });

  it("uses only approved auditable resolution and validated transition operations", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read(`adapters/${provider}.md`);
      expect(adapter).toContain("`npx tsx scripts/ops/list-decisions.ts --json`");
      expect(adapter).toContain("`scripts/ops/resolve-decision.ts --by user`");
      expect(adapter).toContain("`scripts/ops/update-entity-status.ts`");
      expect(adapter).toContain("`decision_resolved` audit outcome");
      expect(adapter).toContain("Never directly edit `journal_entries` or a graph table");
    }

    const statusOperation = readFileSync(
      resolve(process.cwd(), "scripts/ops/update-entity-status.ts"),
      "utf8",
    );
    expect(statusOperation).toContain("Invalid transition:");
    expect(statusOperation).toContain("actionType: 'status_change'");
    expect(statusOperation).toContain("source: 'user'");
  });

  it("refuses every unattended path without reads, writes, prompting, or scheduling", () => {
    const claudePreamble = readFileSync(
      resolve(process.cwd(), ".claude/skills/decisions/HEADLESS_PREAMBLE.md"),
      "utf8",
    );
    const codexPreamble = readFileSync(
      resolve(process.cwd(), ".agents/skills/decisions/HEADLESS_PREAMBLE.md"),
      "utf8",
    );

    expect(codexPreamble).toBe(claudePreamble);
    for (const text of [claudePreamble, codexPreamble]) {
      expect(text).toContain("unconditional refusal");
      expect(text).toContain("Do not inspect open Decision Items");
      expect(text).toContain('"reason":"interactive_user_judgment_required"');
      expect(text).toContain('"writes":[]');
      expect(text).toContain("never eligible for unattended execution or scheduling");
    }

    for (const provider of ["claude", "codex"]) {
      const adapter = read(`adapters/${provider}.md`);
      expect(adapter).toContain("This Capability is interactive-only");
      expect(adapter).toContain("refuse immediately before reading Decision Items");
      expect(adapter).toContain("must never be declared unattended-current, scheduled, or eligible for headless execution");
    }
  });
});
