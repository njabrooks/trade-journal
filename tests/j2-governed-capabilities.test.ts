import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const capabilities = [
  "belief-maintenance",
  "thesis-observation",
  "portfolio-options-advice",
  "morning-attention-brief",
] as const;

function read(capability: string, path: string): string {
  return readFileSync(resolve(process.cwd(), "capabilities", capability, path), "utf8");
}

function digest(capability: string, path: string): string {
  return `sha256:${createHash("sha256").update(read(capability, path)).digest("hex")}`;
}

describe("J2 governed operational Capabilities", () => {
  it("binds every exact adapter and complete current evidence to its package", () => {
    for (const capability of capabilities) {
      const packageDigest = digest(capability, "capability-package.json");
      for (const provider of ["claude", "codex"]) {
        const evidence = JSON.parse(
          read(capability, `evidence/${provider}.json`),
        ) as {
          package_digest: string;
          adapter_digest: string;
          support_state: string;
          results: Record<string, { status: string }>;
        };
        expect(evidence.package_digest).toBe(packageDigest);
        expect(evidence.adapter_digest).toBe(digest(capability, `adapters/${provider}.md`));
        expect(evidence.support_state).toBe("current");
        expect(
          Object.values(evidence.results).every(
            (result) => result.status === "passed",
          ),
        ).toBe(true);
      }
    }
  });

  it("keeps belief maintenance on the producer side of the judgment boundary", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read("belief-maintenance", `adapters/${provider}.md`);
      expect(adapter).toContain("decisionsSurfaced");
      expect(adapter).toContain("must not invoke `scripts/ops/resolve-decision.ts`");
      expect(adapter).toContain("`scripts/ops/update-entity-status.ts`");
      expect(adapter).toContain("cursorBefore");
      expect(adapter).toContain("cursorAfter");
    }
  });

  it("keeps thesis observation sensing-only", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read("thesis-observation", `adapters/${provider}.md`);
      expect(adapter).toContain("This adapter is sensing-only.");
      expect(adapter).toContain("`signal_data_snapshots`");
      expect(adapter).toContain("must not invoke `scripts/ops/resolve-decision.ts`");
      expect(adapter).toContain("raise a Decision Item");
    }
  });

  it("keeps both options modes recommendation-only", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read("portfolio-options-advice", `adapters/${provider}.md`);
      expect(adapter).toContain("`morning-batch` or `leap`");
      expect(adapter).toContain("Radon-managed IBKR gateway on port 4001");
      expect(adapter).toContain("save-advisor-recommendations.ts --stdin");
      expect(adapter).toContain("must never call an order, trade, execution, preview, or staging operation");
      expect(adapter).toContain("write no recommendation batch");
    }
  });

  it("limits the morning brief to one date-keyed upsert", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read("morning-attention-brief", `adapters/${provider}.md`);
      expect(adapter).toContain("scripts/morning-brief-data.ts --json");
      expect(adapter).toContain("scripts/ops/save-morning-brief.ts --stdin");
      expect(adapter).toContain("leaves exactly one row");
      expect(adapter).toContain("This adapter is synthesis-only.");
      expect(adapter).toContain("must not invoke any other write operation");
    }
  });
});
