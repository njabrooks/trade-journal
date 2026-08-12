#!/usr/bin/env tsx
/**
 * list-decisions — read-only view of the OPEN Decision Items (docs/v2/09 §8), the
 * agent-side counterpart to the web DecisionStrip. Powers the /decisions front-door
 * skill and the session-start nudge.
 *
 * "Open" = action_type='decision_required' AND (status='active' OR a snoozed one whose
 * snooze has expired). Read-only — never mutates (scripts/ops/resolve-decision.ts closes
 * them; the API / maintenance self-heal the snoozes).
 *
 * Ranked by urgency tier (risk → belief upkeep → graph hygiene → additive), oldest first
 * within a tier so nothing rots.
 *
 * Usage:
 *   npx tsx scripts/ops/list-decisions.ts            # ranked human summary
 *   npx tsx scripts/ops/list-decisions.ts --json     # structured (the /decisions skill consumes this)
 *   npx tsx scripts/ops/list-decisions.ts --count    # just the number (fast; the session-start nudge)
 */
import { closeDb, db, schema } from "../lib/db.js";
import { sql, and, eq, gt } from "drizzle-orm";
import { getCursor, RELATE_RESEARCH_CURSOR } from "../lib/automationCursor.js";
import { OPEN_DECISION_PREDICATE } from "../lib/decisionItemQuery.js";
import {
  getDecisionPacket,
  DECISION_TYPE_LABELS,
  DECISION_RUNBOOKS,
  DECISION_TYPE_TIERS as TIER,
  UNTYPED_DECISION_TIER as UNTYPED_TIER,
} from "@/lib/types/decisions";

const { journalEntries, researchInsights } = schema;

function parseArgs(argv: string[]): Record<string, boolean> {
  const a: Record<string, boolean> = {};
  for (const x of argv) if (x.startsWith("--")) a[x.slice(2)] = true;
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const rows = await db
    .select({
      id: journalEntries.id,
      objectType: journalEntries.objectType,
      objectId: journalEntries.objectId,
      objectTitle: journalEntries.objectTitle,
      metadata: journalEntries.metadata,
      status: journalEntries.status,
      timestamp: journalEntries.timestamp,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.actionType, "decision_required"),
        OPEN_DECISION_PREDICATE,
      ),
    );

  // --count: just the open-decision number (quick checks).
  if (args.count) {
    console.log(rows.length);
    await closeDb();
    process.exit(0);
  }

  // --nudge: the session-start signal — open decisions + new research waiting, on one line,
  // or nothing at all when the belief layer is clean (no noise). Two fast counts, one process.
  if (args.nudge) {
    const cursor = await getCursor(RELATE_RESEARCH_CURSOR);
    const niq = db
      .select({ n: sql<number>`count(*)::int` })
      .from(researchInsights);
    const niRows = cursor
      ? await niq.where(gt(researchInsights.createdAt, new Date(cursor)))
      : await niq;
    const newInsights = Number(niRows[0]?.n ?? 0);
    const parts: string[] = [];
    if (rows.length > 0)
      parts.push(
        `🔵 ${rows.length} decision${rows.length === 1 ? "" : "s"} pending → /decisions`,
      );
    if (newInsights > 0)
      parts.push(`📥 ${newInsights} new research to relate → /maintenance`);
    if (parts.length) console.log(`[trade-journal] ${parts.join("  ·  ")}`);
    await closeDb();
    process.exit(0);
  }

  const now = Date.now();
  const items = rows.map((r) => {
    const packet = getDecisionPacket(r.metadata);
    const type = packet?.decision_type ?? null;
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const occ =
      typeof meta.occurrenceCount === "number" ? meta.occurrenceCount : 1;
    const ageDays = r.timestamp
      ? Math.floor((now - new Date(r.timestamp).getTime()) / 86_400_000)
      : 0;
    return {
      id: r.id,
      decisionType: type,
      label: type ? DECISION_TYPE_LABELS[type] : "(untyped)",
      objectType: r.objectType,
      objectId: r.objectId,
      objectTitle: r.objectTitle,
      whyRaised: packet?.why_raised ?? r.objectTitle ?? "",
      relatedObjects: packet?.related_objects ?? [],
      recommendedActions: packet?.recommended_actions ?? [],
      defaultRecommendation: packet?.default_recommendation ?? null,
      runbook: packet?.agent_runbook ?? (type ? DECISION_RUNBOOKS[type] : null),
      ageDays,
      occurrenceCount: occ,
      reawokenFromSnooze: r.status === "snoozed",
    };
  });

  items.sort((a, b) => {
    const ta = a.decisionType ? TIER[a.decisionType] : UNTYPED_TIER;
    const tb = b.decisionType ? TIER[b.decisionType] : UNTYPED_TIER;
    if (ta !== tb) return ta - tb;
    return b.ageDays - a.ageDays; // oldest first within a tier
  });

  if (args.json) {
    console.log(JSON.stringify({ count: items.length, items }, null, 2));
    await closeDb();
    process.exit(0);
  }

  if (items.length === 0) {
    console.log(
      "No open decisions. ✅  (Run /maintenance to surface new ones.)",
    );
    await closeDb();
    process.exit(0);
  }
  console.log(`\n=== Open decisions (${items.length}) — ranked ===`);
  for (const it of items) {
    const age = it.ageDays === 0 ? "today" : `${it.ageDays}d`;
    const occ = it.occurrenceCount > 1 ? ` ×${it.occurrenceCount}` : "";
    console.log(`\n• [${it.label}]${occ}  ${it.objectTitle ?? ""}  (${age})`);
    if (it.whyRaised) console.log(`    ${it.whyRaised}`);
    if (it.runbook) console.log(`    → resolve via: ${it.runbook}`);
  }
  console.log(
    `\nRun the /decisions skill to work through these, or close one with scripts/ops/resolve-decision.ts.`,
  );
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
