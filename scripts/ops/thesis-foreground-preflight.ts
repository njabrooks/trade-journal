#!/usr/bin/env tsx

/** Zero-I/O executable preflight for the governed interactive thesis foreground. */
import {
  planThesisForeground,
  type ForegroundRequest,
} from "./lib/thesis-foreground-contract.js";

function parse(
  argv: string[],
):
  | ForegroundRequest
  | { outcome: "refused"; reason: string; reads: []; writes: [] } {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      return {
        outcome: "refused",
        reason: "complete_preflight_arguments_required",
        reads: [],
        writes: [],
      };
    }
    values.set(key.slice(2), value);
  }
  const truthy = (key: string) => values.get(key) === "true";
  return {
    invocation: (values.get("invocation") ??
      "headless") as ForegroundRequest["invocation"],
    userPresent: truthy("user-present"),
    verb: values.get("verb"),
    thesisId: values.get("id"),
    thesisType: values.get("type"),
    inputsComplete: truthy("inputs-complete"),
    judgmentComplete: truthy("judgment-complete"),
    observationAsOf: values.get("as-of"),
    evidenceProvided: truthy("evidence-provided"),
    recordingRequested: truthy("recording-requested"),
    reunderwritingRequested: truthy("reunderwriting-requested"),
  };
}

const parsed = parse(process.argv.slice(2));
const result = "invocation" in parsed ? planThesisForeground(parsed) : parsed;
console.log(JSON.stringify(result));
if (result.outcome !== "ready") process.exitCode = 1;
