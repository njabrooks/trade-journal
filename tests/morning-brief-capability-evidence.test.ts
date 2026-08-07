import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  REQUIRED_UPSTREAM_INPUTS,
  type MorningBriefFreshnessInput,
} from "../capabilities/morning-attention-brief/evaluate-inputs.js";

const evidenceRoot = resolve(
  process.cwd(),
  "capabilities/morning-attention-brief/evidence",
);
const evaluator = resolve(
  process.cwd(),
  "capabilities/morning-attention-brief/evaluate-inputs.ts",
);

type RequiredInput = (typeof REQUIRED_UPSTREAM_INPUTS)[number];
type InputStatus = "current" | "stale" | "missing";

interface Result {
  success: boolean;
  briefDate: string;
  freshness: Record<RequiredInput, { status: InputStatus; observedAt: string | null }>;
  headline: string;
  attention: unknown[];
  persisted: boolean;
  write: unknown | null;
  unavailableInputs: string[];
  errors: string[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(evidenceRoot, path), "utf8")) as T;
}

function evaluateAtPublicSeam(input: MorningBriefFreshnessInput): Result {
  const evaluated = spawnSync(process.execPath, ["--import", "tsx", evaluator], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: JSON.stringify(input),
  });
  expect(evaluated.status).toBe(0);
  expect(evaluated.stderr).toBe("");
  return JSON.parse(evaluated.stdout) as Result;
}

function expectSafeRefusal(result: Result, scenario: Scenario): void {
  expect(result).toMatchObject({
    success: false,
    briefDate: scenario.briefDate,
    persisted: false,
    write: null,
    attention: [],
  });
  expect(result.errors.length).toBeGreaterThan(0);
  for (const trap of scenario.fallbackData) {
    expect(JSON.stringify(result)).not.toContain(trap);
  }
}

type Scenario = MorningBriefFreshnessInput & { fallbackData: string[] };

describe("morning attention brief adapter evidence", () => {
  it.each([{ provider: "claude" }, { provider: "codex" }])(
    "$provider reports every stale required input without synthesizing or persisting",
    () => {
      const scenario = readJson<Scenario>("scenarios/stale-required-inputs.json");
      const result = evaluateAtPublicSeam(scenario);

      expectSafeRefusal(result, scenario);
      expect(result.unavailableInputs).toEqual(REQUIRED_UPSTREAM_INPUTS);
      for (const input of REQUIRED_UPSTREAM_INPUTS) {
        expect(result.freshness[input]).toEqual(scenario.producerFreshness[input]);
      }
    },
  );

  it.each([{ provider: "claude" }, { provider: "codex" }])(
    "$provider reports every missing required input without browsing, re-querying, or assumptions",
    () => {
      const scenario = readJson<Scenario>("scenarios/missing-required-inputs.json");
      const result = evaluateAtPublicSeam(scenario);

      expectSafeRefusal(result, scenario);
      expect(result.unavailableInputs).toEqual(REQUIRED_UPSTREAM_INPUTS);
      for (const input of REQUIRED_UPSTREAM_INPUTS) {
        expect(result.freshness[input]).toEqual({
          status: "missing",
          observedAt: null,
        });
      }
    },
  );
});
