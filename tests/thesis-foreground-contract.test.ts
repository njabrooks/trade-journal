import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildThesisDelta,
  planThesisForeground,
} from "../scripts/ops/lib/thesis-foreground-contract";

const target = { thesisId: "thesis-1", thesisType: "asset" as const };

describe("thesis foreground executable contract", () => {
  it.each(["headless", "scheduled"] as const)(
    "refuses %s before reads or writes",
    (invocation) => {
      expect(
        planThesisForeground({
          invocation,
          userPresent: false,
          verb: "query",
          ...target,
        }),
      ).toEqual({
        outcome: "refused",
        reason: "interactive_thesis_judgment_required",
        reads: [],
        writes: [],
      });
    },
  );

  it("refuses missing intent, target, judgment, and explicit re-underwriting", () => {
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        ...target,
      }),
    ).toMatchObject({ outcome: "refused", reads: [], writes: [] });
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        verb: "query",
      }),
    ).toMatchObject({ outcome: "refused", reads: [], writes: [] });
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        verb: "observe",
        ...target,
      }),
    ).toMatchObject({
      outcome: "refused",
      reason: "complete_inputs_required",
      reads: [],
      writes: [],
    });
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        verb: "observe",
        inputsComplete: true,
        judgmentComplete: true,
        ...target,
      }),
    ).toMatchObject({
      outcome: "refused",
      reason: "explicit_observation_as_of_required",
    });
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        verb: "assess-evidence",
        inputsComplete: true,
        judgmentComplete: true,
        ...target,
      }),
    ).toMatchObject({
      outcome: "refused",
      reason: "assessment_evidence_required",
    });
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        verb: "re-underwrite",
        inputsComplete: true,
        judgmentComplete: true,
        ...target,
      }),
    ).toMatchObject({
      outcome: "refused",
      reason: "explicit_reunderwriting_request_required",
    });
  });

  it("maps only mutating verbs to exact governed dependencies", () => {
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        verb: "query",
        ...target,
      }),
    ).toMatchObject({ dependency: null, readOnly: true, writes: "none" });
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        verb: "what-changed",
        ...target,
      }),
    ).toMatchObject({ dependency: null, readOnly: true, writes: "none" });
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        verb: "observe",
        inputsComplete: true,
        judgmentComplete: true,
        observationAsOf: "2026-08-12T07:00:00Z",
        ...target,
      }),
    ).toMatchObject({
      dependency: "capability:scope:trade-journal/thesis-observation",
      writes: "dependency-only",
    });
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        verb: "assess-evidence",
        inputsComplete: true,
        judgmentComplete: true,
        evidenceProvided: true,
        ...target,
      }),
    ).toMatchObject({
      dependency: "capability:scope:trade-journal/belief-evidence-assessment",
      readOnly: true,
      writes: "none",
    });
    expect(
      planThesisForeground({
        invocation: "interactive",
        userPresent: true,
        verb: "re-underwrite",
        inputsComplete: true,
        judgmentComplete: true,
        reunderwritingRequested: true,
        ...target,
      }),
    ).toMatchObject({
      dependency: "capability:scope:trade-journal/thesis-underwriting",
      writes: "dependency-only",
    });
  });

  it("classifies provenance-bearing deltas and excludes pre-baseline or unprovenanced claims", () => {
    const result = buildThesisDelta({
      expectedArticulationId: "a1",
      articulation: { id: "a1", version: 2, createdAt: "2026-08-01T00:00:00Z" },
      claims: [
        {
          id: "new",
          createdAt: "2026-08-02T00:00:00Z",
          mappedAt: "2026-08-02T00:00:00Z",
          sourceInsightId: "i",
          sourceClaimId: "c",
          sourceArtifactId: null,
        },
        {
          id: "linked",
          createdAt: "2026-07-01T00:00:00Z",
          mappedAt: "2026-08-03T00:00:00Z",
          sourceInsightId: null,
          sourceClaimId: null,
          sourceArtifactId: "r",
        },
        {
          id: "manual",
          createdAt: "2026-08-04T00:00:00Z",
          mappedAt: "2026-08-04T00:00:00Z",
          sourceInsightId: null,
          sourceClaimId: null,
          sourceArtifactId: null,
        },
      ],
      evidence: [
        {
          id: "e1",
          recordedAt: "2026-08-05T00:00:00Z",
          signalStatus: "rejected",
          articulationId: "a0",
        },
        { id: "old", recordedAt: "2026-07-01T00:00:00Z" },
      ],
    });
    expect(result).toMatchObject({
      outcome: "ready",
      excludedClaimsWithoutProvenance: 1,
      writes: [],
    });
    if (result.outcome === "ready") {
      expect(result.claims.map(({ id, deltaKind }) => [id, deltaKind])).toEqual(
        [
          ["new", "newly-created"],
          ["linked", "newly-linked"],
        ],
      );
      expect(result.evidence.map(({ id }) => id)).toEqual(["e1"]);
      expect(result.evidence[0]).toMatchObject({
        signalStatus: "rejected",
        articulationId: "a0",
      });
    }
  });

  it("reports missing baselines and stale articulation bindings without writes", () => {
    expect(
      buildThesisDelta({
        expectedArticulationId: null,
        articulation: null,
        claims: [],
        evidence: [],
      }),
    ).toMatchObject({ outcome: "ready", baseline: null, writes: [] });
    expect(
      buildThesisDelta({
        expectedArticulationId: "old",
        articulation: { id: "new", version: 3, createdAt: "2026-08-01" },
        claims: [],
        evidence: [],
      }),
    ).toEqual({ outcome: "stale", reason: "articulation_changed", writes: [] });
  });

  it("binds the snapshot articulation ID directly into the delta contract", () => {
    const snapshot = {
      thesis: { id: "thesis-1", type: "asset" },
      underwriting: {
        id: "a2",
        version: 2,
        createdAt: "2026-08-01T00:00:00Z",
      },
    };
    expect(
      buildThesisDelta({
        expectedArticulationId: snapshot.underwriting.id,
        articulation: snapshot.underwriting,
        claims: [],
        evidence: [],
      }),
    ).toMatchObject({
      outcome: "ready",
      baseline: { articulationId: "a2" },
      writes: [],
    });
  });

  it("keeps the command on a read-only repeatable snapshot and does not filter transitioned signals", () => {
    const command = readFileSync(
      resolve(process.cwd(), "scripts/ops/thesis-delta.ts"),
      "utf8",
    );

    expect(command).toContain("db.transaction(async (tx)");
    expect(command).toContain(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    expect(command).toContain("signalStatus: evidenceSignals.status");
    expect(command).toContain("articulationId: evidenceSignals.articulationId");
    expect(command).not.toContain('eq(evidenceSignals.status, "active")');
  });
});
