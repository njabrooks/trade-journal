import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const workspaceRoot = process.env.WORKSPACE_REPOSITORY_ROOT;
const lockEvidenceTime = process.env.WORKSPACE_LOCK_EVIDENCE_TIME ?? "2026-08-12";
const governanceIt = workspaceRoot ? it : it.skip;

describe("Workspace evidence freshness governance", () => {
  governanceIt("rejects expired evidence before a governed output is accepted or written", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import=tsx",
        "scripts/ops/prove-evidence-freshness-refusal.ts",
        "--workspace-root",
        resolve(workspaceRoot as string),
        "--format",
        "json",
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const report = JSON.parse(result.stdout) as {
      outcome: string;
      lock_reproduction: {
        evidence_time: string;
        byte_identical: boolean;
      };
      freshness_evaluation: {
        evidence_time: string;
        adapter_state: string;
        expired_evidence_diagnostic: boolean;
      };
      governed_output: {
        validation_rejected: boolean;
        validation_expired_evidence_diagnostic: boolean;
        generation_rejected: boolean;
        generation_expired_evidence_diagnostic: boolean;
        absent_after_generation: boolean;
      };
    };

    expect(report).toMatchObject({
      outcome: "passed",
      lock_reproduction: {
        evidence_time: lockEvidenceTime,
        byte_identical: true,
      },
      freshness_evaluation: {
        evidence_time: "2026-09-06",
        adapter_state: "stale",
        expired_evidence_diagnostic: true,
      },
      governed_output: {
        validation_rejected: true,
        validation_expired_evidence_diagnostic: true,
        generation_rejected: true,
        generation_expired_evidence_diagnostic: true,
        absent_after_generation: true,
      },
    });
  });
});
