import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const evidenceRoot = resolve(
  process.cwd(),
  "capabilities/morning-attention-brief/evidence",
);

const requiredInputs = [
  "thesisObservation",
  "maintenance",
  "optionsAdvice",
  "portfolio",
  "decisions",
  "calendar",
] as const;

type RequiredInput = (typeof requiredInputs)[number];
type InputStatus = "current" | "stale" | "missing";

interface Scenario {
  briefDate: string;
  upstream: Record<RequiredInput, { status: InputStatus; observedAt: string | null }>;
  fallbackTraps: string[];
}

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

function expectSafeRefusal(result: Result, scenario: Scenario): void {
  expect(result).toMatchObject({
    success: false,
    briefDate: scenario.briefDate,
    persisted: false,
    write: null,
    attention: [],
  });
  expect(result.errors.length).toBeGreaterThan(0);
  expect(JSON.stringify(result)).not.toContain(scenario.fallbackTraps.join(""));
}

describe("morning attention brief adapter evidence", () => {
  it.each(["claude", "codex"])(
    "%s reports every stale required input without synthesizing or persisting",
    (provider) => {
      const scenario = readJson<Scenario>("scenarios/stale-required-inputs.json");
      const result = readJson<Result>(
        `results/${provider}-stale-required-inputs.json`,
      );

      expectSafeRefusal(result, scenario);
      expect(result.unavailableInputs).toEqual(requiredInputs);
      for (const input of requiredInputs) {
        expect(result.freshness[input]).toEqual(scenario.upstream[input]);
      }
    },
  );

  it.each(["claude", "codex"])(
    "%s reports every missing required input without browsing, re-querying, or assumptions",
    (provider) => {
      const scenario = readJson<Scenario>("scenarios/missing-required-inputs.json");
      const result = readJson<Result>(
        `results/${provider}-missing-required-inputs.json`,
      );

      expectSafeRefusal(result, scenario);
      expect(result.unavailableInputs).toEqual(requiredInputs);
      for (const input of requiredInputs) {
        expect(result.freshness[input]).toEqual({
          status: "missing",
          observedAt: null,
        });
      }
      for (const trap of scenario.fallbackTraps) {
        expect(JSON.stringify(result)).not.toContain(trap);
      }
    },
  );
});
