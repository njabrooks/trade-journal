import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMorningBriefProducerFreshness,
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
  it("reports every stale required input without synthesizing or persisting", () => {
    const scenario = readJson<Scenario>("scenarios/stale-required-inputs.json");
    const result = evaluateAtPublicSeam(scenario);

    expectSafeRefusal(result, scenario);
    expect(result.unavailableInputs).toEqual(REQUIRED_UPSTREAM_INPUTS);
    for (const input of REQUIRED_UPSTREAM_INPUTS) {
      expect(result.freshness[input]).toEqual(scenario.producerFreshness[input]);
    }
  });

  it("reports every missing required input without browsing, re-querying, or assumptions", () => {
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
  });

  it("refuses a producer declared current without a valid observation time", () => {
    const producerFreshness = Object.fromEntries(
      REQUIRED_UPSTREAM_INPUTS.map((input) => [
        input,
        { status: "current", observedAt: "2026-08-07T07:30:00Z" },
      ]),
    ) as MorningBriefFreshnessInput["producerFreshness"];
    producerFreshness.maintenance = { status: "current", observedAt: null };
    const result = evaluateAtPublicSeam({
      briefDate: "2026-08-07",
      producerFreshness,
    });

    expect(result.success).toBe(false);
    expect(result.freshness.maintenance).toEqual({
      status: "missing",
      observedAt: null,
    });
    expect(result.unavailableInputs).toEqual(["maintenance"]);
    expect(result.persisted).toBe(false);
    expect(result.write).toBeNull();
  });

  it("accepts producer freshness emitted for a real fresh morning bundle", () => {
    const generatedAt = "2026-08-07T07:45:00Z";
    const producerFreshness = buildMorningBriefProducerFreshness({
      generatedAt,
      cronStatusTsv: [
        "2026-08-07T06:58:00Z\tthesis-observe\t0",
        "2026-08-07T07:01:00Z\tmaintenance\t0",
        "2026-08-07T07:05:00Z\toptions-advisor-batch\t0",
      ].join("\n"),
      portfolioObservedAt: "2026-08-07T00:00:00Z",
      decisionsObservedAt: generatedAt,
      calendarObservedAt: generatedAt,
    });
    const result = evaluateAtPublicSeam({
      briefDate: "2026-08-07",
      producerFreshness,
    });

    expect(result.success).toBe(true);
    expect(result.unavailableInputs).toEqual([]);
    expect(result.errors).toEqual([]);
    for (const input of REQUIRED_UPSTREAM_INPUTS) {
      expect(result.freshness[input].status).toBe("current");
      expect(result.freshness[input].observedAt).not.toBeNull();
    }
  });

  it("refuses an impossible brief date even when every producer is fresh", () => {
    const generatedAt = "2026-08-07T07:45:00Z";
    const producerFreshness = buildMorningBriefProducerFreshness({
      generatedAt,
      cronStatusTsv: [
        "2026-08-07T06:58:00Z\tthesis-observe\t0",
        "2026-08-07T07:01:00Z\tmaintenance\t0",
        "2026-08-07T07:05:00Z\toptions-advisor-batch\t0",
      ].join("\n"),
      portfolioObservedAt: "2026-08-07T00:00:00Z",
      decisionsObservedAt: generatedAt,
      calendarObservedAt: generatedAt,
    });
    const result = evaluateAtPublicSeam({
      briefDate: "2026-13-40",
      producerFreshness,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain("briefDate must be an ISO calendar date.");
    expect(result.persisted).toBe(false);
    expect(result.write).toBeNull();
  });
});
