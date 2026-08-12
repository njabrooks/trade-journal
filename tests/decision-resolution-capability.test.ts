import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertExplicitUserJudgment,
  assertBoundedDecisionSelection,
  assertValidDecisionResolutionRequest,
  isOpenDecisionItem,
  MISSING_USER_JUDGMENT_MESSAGE,
} from "../scripts/lib/decisionResolutionAuthority";

const capabilityRoot = resolve(
  process.cwd(),
  "capabilities/decision-resolution",
);
const workspaceRoot = process.env.WORKSPACE_REPOSITORY_ROOT;
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
    .update(readFileSync(resolve(process.cwd(), path)))
    .digest("hex")}`;
}

function inventoryEntry(path: string, id: string): Record<string, unknown> {
  const inventory = JSON.parse(
    readFileSync(resolve(process.cwd(), path), "utf8"),
  ) as { entries: Array<Record<string, unknown>> };
  return inventory.entries.find((entry) => entry.id === id)!;
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
      expect(
        Object.values(results).every(({ status }) => status === "passed"),
      ).toBe(true);
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
    expect(
      resolver.indexOf("assertValidDecisionResolutionRequest(input)"),
    ).toBeLessThan(resolver.indexOf(".from(journalEntries)"));
    expect(resolver).toContain("chosen_by: input.by");
    expect(resolver).toContain('actionType: "decision_resolved"');
  });

  it("accepts only active or expired-snoozed Decision Items", () => {
    const now = new Date("2026-08-12T12:00:00Z");

    expect(isOpenDecisionItem({ status: "active" }, now)).toBe(true);
    expect(
      isOpenDecisionItem(
        { status: "snoozed", snoozedUntil: "2026-08-12T11:59:59Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isOpenDecisionItem(
        { status: "snoozed", snoozedUntil: "2026-08-12T12:00:01Z" },
        now,
      ),
    ).toBe(false);
    expect(isOpenDecisionItem({ status: "resolved" }, now)).toBe(false);
    expect(isOpenDecisionItem({ status: "dismissed" }, now)).toBe(false);
    expect(isOpenDecisionItem({ status: "superseded" }, now)).toBe(false);

    const resolver = readFileSync(
      resolve(process.cwd(), "scripts/ops/resolve-decision.ts"),
      "utf8",
    );
    expect(resolver).toContain("OPEN_DECISION");
    expect(resolver).toContain("No open decision_required journal entry");
  });

  it("rejects malformed or unbounded resolution input before operational writes", () => {
    const completePacket = {
      schema_version: 1,
      decision_type: "classify_exposure",
      related_objects: [],
      why_raised: "The exposure needs a user classification.",
      recommended_actions: [
        { action: "classify_tactical" },
        { action: "classify_belief" },
      ],
      agent_runbook: "update-entity-status",
      resolution: null,
    };
    const valid: {
      id: string;
      action: string;
      by: "user";
      status: "resolved";
      writes: Array<{
        table: string;
        op: "update";
        ids: string[];
      }>;
    } = {
      id: "decision-1",
      action: "classify_tactical",
      by: "user",
      status: "resolved",
      writes: [{ table: "asset_theses", op: "update", ids: ["thesis-1"] }],
    };

    expect(() => assertValidDecisionResolutionRequest(valid)).not.toThrow();
    expect(() =>
      assertBoundedDecisionSelection(valid, completePacket),
    ).not.toThrow();
    expect(() =>
      assertValidDecisionResolutionRequest({
        ...valid,
        status: "active",
      }),
    ).toThrow("status must be resolved or dismissed");
    expect(() =>
      assertValidDecisionResolutionRequest({
        ...valid,
        writes: [{ table: "asset_theses", op: "update", ids: [] }],
      }),
    ).toThrow("writes are malformed");
    expect(() =>
      assertBoundedDecisionSelection(
        { ...valid, action: "agent_invented_action" },
        completePacket,
      ),
    ).toThrow("unsupported action");
    expect(() =>
      assertBoundedDecisionSelection(valid, {
        ...completePacket,
        resolution: { action_taken: "classify_tactical" },
      }),
    ).toThrow("complete unresolved Decision Item packet");
    expect(() =>
      assertBoundedDecisionSelection(
        { ...valid, action: "map" },
        {
          ...completePacket,
          decision_type: "resolve_proxy_underlying",
          recommended_actions: [{ action: "map" }],
        },
      ),
    ).toThrow("derive their own exact write audit");

    const resolver = readFileSync(
      resolve(process.cwd(), "scripts/ops/resolve-decision.ts"),
      "utf8",
    );
    expect(
      resolver.indexOf("assertValidDecisionResolutionRequest(input)"),
    ).toBeLessThan(resolver.indexOf(".from(journalEntries)"));
    expect(
      resolver.indexOf("assertBoundedDecisionSelection(input, packet)"),
    ).toBeLessThan(resolver.indexOf("runHandler(row, packet, input)"));
  });

  it("uses only approved auditable resolution and validated transition operations", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read(`adapters/${provider}.md`);
      expect(adapter).toContain(
        "`npx tsx scripts/ops/list-decisions.ts --json`",
      );
      expect(adapter).toContain("`scripts/ops/resolve-decision.ts --by user`");
      expect(adapter).toContain("`scripts/ops/update-entity-status.ts`");
      expect(adapter).toContain("`decision_resolved` audit outcome");
      expect(adapter).toContain(
        "Never directly edit `journal_entries` or a graph table",
      );
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
      expect(text).toContain(
        "never eligible for unattended execution or scheduling",
      );
    }

    for (const provider of ["claude", "codex"]) {
      const adapter = read(`adapters/${provider}.md`);
      expect(adapter).toContain("This Capability is interactive-only");
      expect(adapter).toContain(
        "refuse immediately before reading Decision Items",
      );
      expect(adapter).toContain(
        "must never be declared unattended-current, scheduled, or eligible for headless execution",
      );
    }
  });

  it("reconciles current inventory evidence without granting unattended eligibility", () => {
    const interactive = inventoryEntry(
      "docs/agents/provider-adapters/interactive-inventory.json",
      "interactive-claude-decisions",
    );
    const headless = inventoryEntry(
      "docs/agents/provider-adapters/headless-inventory.json",
      "headless-codex-decisions",
    );

    expect(interactive).toMatchObject({
      source: { path: "capabilities/decision-resolution/adapters/claude.md" },
      packaging: "governed-provider-adapter",
      invocation: {
        mode: "interactive",
        unattended_eligibility: "ineligible",
      },
      evidence: { state: "current", capability_version: "1.0.0" },
    });
    expect(headless).toMatchObject({
      source: { path: "capabilities/decision-resolution/adapters/codex.md" },
      packaging: "governed-provider-adapter",
      execution_contract: {
        class: "bespoke",
        preamble_path: ".claude/skills/decisions/HEADLESS_PREAMBLE.md",
      },
      invocation: {
        mode: "headless",
        unattended_eligibility: "ineligible",
      },
      authority_and_write_scope: {
        reads: expect.stringContaining("No unattended reads"),
        writes: expect.stringContaining("No unattended writes"),
      },
      evidence: { state: "current", capability_version: "1.0.0" },
    });
  });

  it("records exact deterministic publication artifacts and unchanged operational scope", () => {
    const receipt = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "evidence/issue-60-decision-resolution.json"),
        "utf8",
      ),
    ) as Record<string, Record<string, unknown>>;
    const artifacts = receipt.published_artifacts;

    expect(artifacts).toMatchObject({
      registry_lock: repositoryDigest("capability-registry-lock.json"),
      claude_staging: repositoryDigest(
        "docs/agents/provider-entry-points/staging/claude.md",
      ),
      codex_staging: repositoryDigest(
        "docs/agents/provider-entry-points/staging/codex.md",
      ),
      interactive_inventory: repositoryDigest(
        "docs/agents/provider-adapters/interactive-inventory.json",
      ),
      headless_inventory: repositoryDigest(
        "docs/agents/provider-adapters/headless-inventory.json",
      ),
      generation_eligibility: repositoryDigest(
        "docs/agents/provider-adapters/generation-eligibility.json",
      ),
      inventory_entries: 74,
      generation_eligible_entries: 56,
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
            "capabilities/decision-resolution",
            "--evidence-time",
            "2026-08-12",
            "--format",
            "json",
          ],
          { cwd: process.cwd(), encoding: "utf8", env: environment },
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
            "2026-08-12",
            "--format",
            "json",
          ],
          { cwd: process.cwd(), encoding: "utf8", env: environment },
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
