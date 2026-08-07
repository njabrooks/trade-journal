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

export interface MorningBriefProducerObservations {
  generatedAt: string;
  cronStatusTsv: string;
  portfolioObservedAt: string | null;
  decisionsObservedAt: string | null;
  calendarObservedAt: string | null;
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

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeFreshness(value: unknown): ProducerFreshness {
  if (!isRecord(value)) return { status: "missing", observedAt: null };
  const status = value.status;
  if (status !== "current" && status !== "stale" && status !== "missing") {
    return { status: "missing", observedAt: null };
  }
  if (status !== "missing" && !validTimestamp(value.observedAt)) {
    return { status: "missing", observedAt: null };
  }
  return {
    status,
    observedAt: validTimestamp(value.observedAt) ? value.observedAt : null,
  };
}

interface ProducerObservation {
  observedAt: string | null;
  succeeded: boolean;
}

function latestCronObservation(
  cronStatusTsv: string,
  job: string,
): ProducerObservation | null {
  let latest: ProducerObservation | null = null;
  for (const line of cronStatusTsv.split("\n")) {
    const [observedAt, statusName, result] = line.trim().split("\t");
    if (statusName !== job || !validTimestamp(observedAt)) continue;
    if (!latest || Date.parse(observedAt) > Date.parse(latest.observedAt ?? "")) {
      latest = { observedAt, succeeded: result === "0" };
    }
  }
  return latest;
}

function assessObservation(
  observation: ProducerObservation | null,
  generatedAt: string,
  maxAgeHours: number,
): ProducerFreshness {
  if (!observation || !validTimestamp(observation.observedAt)) {
    return { status: "missing", observedAt: null };
  }
  if (!observation.succeeded) {
    return { status: "missing", observedAt: observation.observedAt };
  }
  const ageHours =
    (Date.parse(generatedAt) - Date.parse(observation.observedAt)) / 3_600_000;
  if (ageHours < 0 || ageHours > maxAgeHours) {
    return { status: "stale", observedAt: observation.observedAt };
  }
  return { status: "current", observedAt: observation.observedAt };
}

export function buildMorningBriefProducerFreshness(
  observations: MorningBriefProducerObservations,
): Record<RequiredInput, ProducerFreshness> {
  const generatedAt = observations.generatedAt;
  const directObservation = (observedAt: string | null): ProducerObservation => ({
    observedAt,
    succeeded: true,
  });
  return {
    thesisObservation: assessObservation(
      latestCronObservation(observations.cronStatusTsv, "thesis-observe"),
      generatedAt,
      26,
    ),
    maintenance: assessObservation(
      latestCronObservation(observations.cronStatusTsv, "maintenance"),
      generatedAt,
      14,
    ),
    optionsAdvice: assessObservation(
      latestCronObservation(observations.cronStatusTsv, "options-advisor-batch"),
      generatedAt,
      26,
    ),
    portfolio: assessObservation(
      directObservation(observations.portfolioObservedAt),
      generatedAt,
      36,
    ),
    decisions: assessObservation(
      directObservation(observations.decisionsObservedAt),
      generatedAt,
      1,
    ),
    calendar: assessObservation(
      directObservation(observations.calendarObservedAt),
      generatedAt,
      1,
    ),
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

  if (!validIsoCalendarDate(briefDate)) {
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
