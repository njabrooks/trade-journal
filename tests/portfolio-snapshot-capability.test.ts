import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const capabilityRoot = resolve(
  process.cwd(),
  "capabilities/portfolio-snapshot",
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

describe("portfolio-snapshot Capability", () => {
  it("binds both exact adapters to the source-owned package", () => {
    const packageDigest = digest("capability-package.json");

    for (const provider of ["claude", "codex"]) {
      const evidence = readJson(`evidence/${provider}.json`);

      expect(evidence.package_digest).toBe(packageDigest);
      expect(evidence.adapter_digest).toBe(
        digest(`adapters/${provider}.md`),
      );
      expect(evidence.support_state).toBe("current");
    }
  });

  it("keeps each provider adapter on the read-only command boundary", () => {
    for (const provider of ["claude", "codex"]) {
      const adapter = read(`adapters/${provider}.md`);
      const commands = adapter.match(/`[^`]+`/g) ?? [];

      expect(commands).toContain("`npx tsx scripts/pull-portfolio.ts`");
      expect(adapter).toContain("This adapter is read-only.");
      expect(adapter).toContain("does not mutate Trade Journal state or place trades");
      expect(adapter).not.toMatch(/scripts\/ops\//);
      expect(adapter).not.toMatch(/resolve-decision|update-entity-status|add-journal-note/);
    }
  });
});
