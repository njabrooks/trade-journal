import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const capabilityRoot = resolve(
  process.cwd(),
  "capabilities/thesis-underwriting",
);

function read(path: string): string {
  return readFileSync(resolve(capabilityRoot, path), "utf8");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

function digest(path: string): string {
  return `sha256:${createHash("sha256").update(read(path)).digest("hex")}`;
}

describe("thesis-underwriting Capability", () => {
  it("binds both exact adapters to current, complete evidence", () => {
    const packageDigest = digest("capability-package.json");

    for (const provider of ["claude", "codex"]) {
      const evidence = readJson(`evidence/${provider}.json`);
      const results = evidence.results as Record<
        string,
        { status: string }
      >;

      expect(evidence.package_digest).toBe(packageDigest);
      expect(evidence.adapter_digest).toBe(
        digest(`adapters/${provider}.md`),
      );
      expect(evidence.support_state).toBe("current");
      expect(Object.values(results).every(({ status }) => status === "passed")).toBe(true);
    }
  });

  it("preserves the living-underwriting contract without reviving manual signal configuration", () => {
    const capabilityPackage = readJson("capability-package.json");
    const contract = String(capabilityPackage.contract);
    const instructions = capabilityPackage.instructions as string[];

    expect(contract).toContain("versioned thesis articulation");
    expect(contract).toContain("derived resolution signals");
    expect(contract).toContain("does not change thesis status");
    expect(instructions).toContain(
      "Derive qualitative confirmation, invalidation, and completion signals from linked claims, counterarguments, assumptions, timeframes, and legitimate thesis dependencies.",
    );
    expect(instructions).toContain(
      "Never author manual signal thresholds, data sources, explicit_details, or retired configure-signal behaviour.",
    );
    expect(instructions).toContain(
      "Before synthesis, require all in-scope evidence to be linked: if thesis-snapshot reports unlinked claims, report the relation prerequisite and do not write a new articulation until the evidence set is complete.",
    );
    expect(instructions).toContain(
      "When signal-quality diagnostics or candidate signals are non-empty, refine the resolution section by sharpening or dropping chronic-neutral statements, covering material gaps, and promoting or dismissing every assessed candidate.",
    );
  });

  it("makes the bounded articulation write explicit while refusing unsupported mutation", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read(`adapters/${provider}.md`);

      expect(adapter).toContain("scripts/insert-thesis-articulation.ts");
      expect(adapter).toContain("new versioned articulation");
      expect(adapter).toContain("derived resolution signals");
      expect(adapter).toContain("must not change thesis status");
      expect(adapter).toContain("must not invoke `scripts/ops/update-entity-status.ts`");
      expect(adapter).toContain("must not invoke `scripts/ops/resolve-decision.ts`");
      expect(adapter).toContain("Never create manual signal thresholds, data sources, or `explicit_details`");
      expect(adapter).toContain("thin.unlinkedClaimCount");
      expect(adapter).toContain("do not write a new articulation until those claims are related");
      expect(adapter).toContain("must sharpen or drop chronic-neutral statements");
      expect(adapter).toContain("promote or dismiss every assessed candidate signal");
      expect(adapter).toContain("whenever a new resolution statement continues a prior signal");
    }
  });
});
