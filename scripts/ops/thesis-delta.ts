#!/usr/bin/env tsx

/** Read-only, exact-target delta surface for the governed thesis foreground. */
import { and, desc, eq } from "drizzle-orm";
import {
  buildThesisDelta,
  type ThesisType,
} from "./lib/thesis-foreground-contract.js";

type Args = {
  id: string;
  type: ThesisType;
  expectedArticulationId: string | null;
};

function parseArgs(argv: string[]): Args | { error: string; writes: [] } {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || !value)
      return { error: "complete_delta_arguments_required", writes: [] };
    values.set(key.slice(2), value);
  }
  const id = values.get("id");
  const type = values.get("type");
  const expected = values.get("expected-articulation-id");
  if (!id || (type !== "macro" && type !== "asset") || expected === undefined) {
    return {
      error: "exact_thesis_and_expected_articulation_required",
      writes: [],
    };
  }
  return {
    id,
    type,
    expectedArticulationId: expected === "none" ? null : expected,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if ("error" in args) {
    console.log(JSON.stringify(args));
    process.exitCode = 1;
    return;
  }

  // Import only after deterministic argument refusal, so incomplete requests perform no DB read.
  const [{ db, closeDb, schema }, { alias }] = await Promise.all([
    import("../lib/db.js"),
    import("drizzle-orm/pg-core"),
  ]);
  const {
    assetTheses,
    macroTheses,
    thesisArticulations,
    claimThesisMappings,
    mainClaims,
    signals,
    signalEntityLinks,
    signalDataSnapshots,
  } = schema;

  try {
    const thesisTable = args.type === "macro" ? macroTheses : assetTheses;
    const [thesis] = await db
      .select({ id: thesisTable.id, title: thesisTable.title })
      .from(thesisTable)
      .where(eq(thesisTable.id, args.id))
      .limit(1);
    if (!thesis) {
      console.log(
        JSON.stringify({
          outcome: "unavailable",
          reason: "thesis_not_found",
          writes: [],
        }),
      );
      process.exitCode = 1;
      return;
    }

    const [articulation] = await db
      .select({
        id: thesisArticulations.id,
        version: thesisArticulations.version,
        createdAt: thesisArticulations.createdAt,
      })
      .from(thesisArticulations)
      .where(
        and(
          eq(thesisArticulations.thesisId, args.id),
          eq(thesisArticulations.thesisType, args.type),
        ),
      )
      .orderBy(desc(thesisArticulations.version))
      .limit(1);

    const thesisColumn =
      args.type === "macro"
        ? claimThesisMappings.macroThesisId
        : claimThesisMappings.assetThesisId;
    const claims = await db
      .select({
        id: mainClaims.id,
        title: mainClaims.title,
        mappingType: claimThesisMappings.mappingType,
        createdAt: mainClaims.createdAt,
        mappedAt: claimThesisMappings.mappedAt,
        sourceInsightId: mainClaims.sourceInsightId,
        sourceClaimId: mainClaims.sourceClaimId,
        sourceArtifactId: mainClaims.sourceArtifactId,
        qualifier: mainClaims.qualifier,
        rebuttal: mainClaims.rebuttal,
      })
      .from(claimThesisMappings)
      .innerJoin(mainClaims, eq(claimThesisMappings.mainClaimId, mainClaims.id))
      .where(eq(thesisColumn, args.id));

    const evidenceSignals = alias(signals, "evidence_signals");
    const evidence = await db
      .select({
        id: signalDataSnapshots.id,
        signalId: signalDataSnapshots.signalId,
        signalType: evidenceSignals.type,
        signalStatement: evidenceSignals.statement,
        recordedAt: signalDataSnapshots.snapshotDate,
        assessment: signalDataSnapshots.assessment,
        evidenceSummary: signalDataSnapshots.evidenceSummary,
        dataSource: signalDataSnapshots.dataSource,
        claimId: signalDataSnapshots.claimId,
        status: signalDataSnapshots.status,
      })
      .from(signalDataSnapshots)
      .innerJoin(
        evidenceSignals,
        eq(signalDataSnapshots.signalId, evidenceSignals.id),
      )
      .innerJoin(
        signalEntityLinks,
        eq(evidenceSignals.id, signalEntityLinks.signalId),
      )
      .where(
        and(
          eq(signalEntityLinks.entityType, "thesis"),
          eq(signalEntityLinks.thesisId, args.id),
          eq(signalEntityLinks.thesisType, args.type),
          eq(evidenceSignals.status, "active"),
        ),
      )
      .orderBy(desc(signalDataSnapshots.snapshotDate));

    const delta = buildThesisDelta({
      expectedArticulationId: args.expectedArticulationId,
      articulation: articulation ?? null,
      claims,
      evidence,
    });
    console.log(
      JSON.stringify(
        { thesis: { ...thesis, type: args.type }, ...delta },
        null,
        2,
      ),
    );
    if (delta.outcome !== "ready") process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      outcome: "failed",
      reason: (error as Error).message,
      writes: [],
    }),
  );
  process.exitCode = 1;
});
