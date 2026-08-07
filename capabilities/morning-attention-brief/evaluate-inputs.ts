#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_UPSTREAM_INPUTS = [
  "thesisObservation",
  "maintenance",
  "optionsAdvice",
  "portfolio",
  "decisions",
  "calendar",
] as const;

type RequiredInput = (typeof REQUIRED_UPSTREAM_INPUTS)[number];
type InputStatus = "current" | "stale" | "missing";

export interface ProducerFreshness {
  status: InputStatus;
  observedAt: string | null;
}

export interface MorningBriefFreshnessInput {
  briefDate: string;
  producerFreshness: Partial<Record<RequiredInput, ProducerFreshness>>;
}

export interface MorningBriefFreshnessResult {
  success: boolean;
  briefDate: string;
  freshness: Record<RequiredInput, ProducerFreshness>;
  headline: string;
  attention: [];
  persisted: false;
  write: null;
  unavailableInputs: RequiredInput[];
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFreshness(value: unknown): ProducerFreshness {
  if (!isRecord(value)) return { status: "missing", observedAt: null };
  const status = value.status;
  if (status !== "current" && status !== "stale" && status !== "missing") {
    return { status: "missing", observedAt: null };
  }
  return {
    status,
    observedAt: typeof value.observedAt === "string" ? value.observedAt : null,
  };
}

export function evaluateMorningBriefInputs(
  input: unknown,
): MorningBriefFreshnessResult {
  const request = isRecord(input) ? input : {};
  const briefDate =
    typeof request.briefDate === "string" ? request.briefDate : "";
  const declaredFreshness = isRecord(request.producerFreshness)
    ? request.producerFreshness
    : {};
  const freshness = Object.fromEntries(
    REQUIRED_UPSTREAM_INPUTS.map((name) => [
      name,
      normalizeFreshness(declaredFreshness[name]),
    ]),
  ) as Record<RequiredInput, ProducerFreshness>;
  const unavailableInputs = REQUIRED_UPSTREAM_INPUTS.filter(
    (name) => freshness[name].status !== "current",
  );
  const errors: string[] = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(briefDate)) {
    errors.push("briefDate must be an ISO calendar date.");
  }
  if (unavailableInputs.length > 0) {
    const states = unavailableInputs.map(
      (name) => `${name}:${freshness[name].status}`,
    );
    errors.push(
      `Required upstream state is unavailable (${states.join(", ")}); synthesis and persistence are refused.`,
    );
  }

  const success = errors.length === 0;
  return {
    success,
    briefDate,
    freshness,
    headline: success
      ? ""
      : "Morning brief unavailable: required upstream state is stale or missing.",
    attention: [],
    persisted: false,
    write: null,
    unavailableInputs,
    errors,
  };
}

function main(): void {
  try {
    const input = JSON.parse(readFileSync(0, "utf8")) as unknown;
    console.log(JSON.stringify(evaluateMorningBriefInputs(input)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
