import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: { execute: vi.fn() },
}));

import { db } from "@/db";
import {
  analyzeTicker,
  type AnalysisOutput,
  type AnalyzeOptions,
} from "@/lib/volCurveAnalyzer";

const capabilityRoot = resolve(
  process.cwd(),
  "capabilities/options-vol-analysis",
);
const fixturePath = resolve(
  process.cwd(),
  "tests/fixtures/options-vol-analysis.json",
);

interface Fixture {
  input: AnalyzeOptions;
  chain: Array<Record<string, unknown>>;
  iv30: Array<Record<string, unknown>>;
  realizedVolSpots: Array<Record<string, unknown>>;
  volHistory: Array<Record<string, unknown>>;
  expectedOutputDigest: string;
}

function read(path: string): string {
  return readFileSync(resolve(capabilityRoot, path), "utf8");
}

function digestText(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digest(path: string): string {
  return digestText(read(path));
}

function repositoryDigest(path: string): string {
  return digestText(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
}

function primeDatabase(fixture: Fixture): void {
  const execute = vi.mocked(db.execute);
  execute
    .mockResolvedValueOnce(structuredClone(fixture.chain) as never)
    .mockResolvedValueOnce(structuredClone(fixture.iv30) as never)
    .mockResolvedValueOnce(structuredClone(fixture.realizedVolSpots) as never)
    .mockResolvedValueOnce(structuredClone(fixture.volHistory) as never);
}

async function runFixture(fixture: Fixture): Promise<AnalysisOutput> {
  primeDatabase(fixture);
  return analyzeTicker(structuredClone(fixture.input));
}

beforeEach(() => {
  vi.mocked(db.execute).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("options-vol-analysis Capability", () => {
  it("binds both exact adapters to the source-owned package", () => {
    const packageDigest = digest("capability-package.json");

    for (const provider of ["claude", "codex"]) {
      const evidence = JSON.parse(read(`evidence/${provider}.json`)) as {
        package_digest: string;
        adapter_digest: string;
        support_state: string;
        results: Record<string, { status: string }>;
      };

      expect(evidence.package_digest).toBe(packageDigest);
      expect(evidence.adapter_digest).toBe(
        digest(`adapters/${provider}.md`),
      );
      expect(evidence.support_state).toBe("current");
      expect(
        Object.values(evidence.results).every(
          (result) => result.status === "passed",
        ),
      ).toBe(true);
    }
  });

  it("makes both providers preserve the same analyzer and result envelope", () => {
    const claude = read("adapters/claude.md");
    const codex = read("adapters/codex.md");
    const command = "npx tsx scripts/vol-curve-analyze.ts";

    for (const adapter of [claude, codex]) {
      expect(adapter).toContain(command);
      expect(adapter).toContain("the complete `AnalysisOutput`");
      expect(adapter).toContain("do not recompute, reorder, omit, or replace");
      expect(adapter).toContain("`quoteVerification`");
      expect(adapter).toContain("`persistence`");
      expect(adapter).toContain("`writes`");
      expect(adapter).toContain("`unavailableInputs`");
      expect(adapter).toContain("`errors`");
    }
  });

  it("produces byte-equivalent analysis from the digest-bound fixture", async () => {
    const fixture = loadFixture();
    const claudeResult = await runFixture(fixture);
    vi.mocked(db.execute).mockReset();
    const codexResult = await runFixture(fixture);

    expect(codexResult).toEqual(claudeResult);
    expect(claudeResult.context).toMatchObject({
      ticker: "FIXT",
      spot: 100,
      contractCount: fixture.chain.length,
      expiryCount: 2,
      dataSource: "database",
    });
    expect(claudeResult.strategies.length).toBeGreaterThan(0);
    expect(digestText(JSON.stringify(claudeResult))).toBe(
      fixture.expectedOutputDigest,
    );
  });

  it("keeps report persistence explicit and Radon quote authority separate", () => {
    const saver = readFileSync(
      resolve(process.cwd(), "scripts/vol-curve-save-report.ts"),
      "utf8",
    );

    expect(saver).toContain("args.includes('--stdin')");
    expect(saver).toContain(".insert(schema.volCurveReports)");
    expect(saver.match(/\.insert\(/g)).toHaveLength(1);

    for (const provider of ["claude", "codex"]) {
      const adapter = read(`adapters/${provider}.md`);

      expect(adapter).toContain("`persist` (default `false`)");
      expect(adapter).toContain(
        "`npx tsx scripts/vol-curve-save-report.ts --stdin`",
      );
      expect(adapter).toContain("exactly one `vol_curve_reports` insert");
      expect(adapter).toContain(
        "Radon owns `capability:scope:radon/ibkr-option-quote`",
      );
      expect(adapter).toContain("`quoteVerification.status: unavailable`");
      expect(adapter).toContain("Do not inspect or operate the gateway");
      expect(adapter).toContain("analysis authority only");
      expect(adapter).not.toMatch(/scripts\/ibkr-option-quote\.py/);
      expect(adapter).not.toMatch(/scripts\/ibkr-quote-contracts\.py/);
    }
  });

  it("records exact deterministic, live-data, publication, and scope evidence", () => {
    const receipt = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "evidence/issue-64-options-vol-analysis.json",
        ),
        "utf8",
      ),
    ) as Record<string, Record<string, unknown>>;

    expect(receipt.fixed_point).toBe(
      "337acbb74f8988f9742d2126f2615f149811795c",
    );
    expect(receipt.release_revision).toBe(
      "a165aacc7991946dcb2cc5983790fc22c09a3663",
    );

    const equivalence = receipt.deterministic_equivalence;
    expect(equivalence.fixture_digest).toBe(
      repositoryDigest("tests/fixtures/options-vol-analysis.json"),
    );
    expect(equivalence.claude_and_codex_results_equivalent).toBe(true);
    expect(equivalence.writes).toEqual([]);

    const liveProbe = receipt.eligible_live_data_probe;
    expect(liveProbe.classification).toBe(
      "separate-read-only-environmental-evidence",
    );
    expect(liveProbe.persistence_requested).toBe(false);
    expect(liveProbe.writes).toEqual([]);
    expect(liveProbe.radon_invoked).toBe(false);
    expect(liveProbe.quote_verification).toMatchObject({
      status: "unavailable",
    });

    const artifacts = receipt.published_artifacts;
    expect(artifacts.registry_lock).toBe(
      repositoryDigest("capability-registry-lock.json"),
    );
    expect(artifacts.claude_staging).toBe(
      repositoryDigest("docs/agents/provider-entry-points/staging/claude.md"),
    );
    expect(artifacts.codex_staging).toBe(
      repositoryDigest("docs/agents/provider-entry-points/staging/codex.md"),
    );
    expect(artifacts.interactive_inventory).toBe(
      repositoryDigest(
        "docs/agents/provider-adapters/interactive-inventory.json",
      ),
    );
    expect(artifacts.headless_inventory).toBe(
      repositoryDigest("docs/agents/provider-adapters/headless-inventory.json"),
    );
    expect(artifacts.generation_eligibility).toBe(
      repositoryDigest(
        "docs/agents/provider-adapters/generation-eligibility.json",
      ),
    );

    expect(receipt.scope_confirmation).toMatchObject({
      active_discovery_changed: false,
      scheduler_or_credential_changed: false,
      gateway_inspected_or_operated: false,
      executable_quote_requested_or_fabricated: false,
      contract_qualification_invoked: false,
      database_write: false,
      status_or_decision_item_changed: false,
      strategy_position_order_or_trade_authority: false,
      github_issue_65_started_or_modified: false,
    });
  });
});
