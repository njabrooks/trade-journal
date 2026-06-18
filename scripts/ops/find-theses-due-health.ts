#!/usr/bin/env tsx
/**
 * The thesis-health-pass worklist (W8 — docs/v2/07 §4c, B5c).
 *
 * Monitoring theses with active signals that are due for a health re-assessment
 * (new routed evidence since last review, or the weekly floor elapsed). The queue
 * the thesis-review skill (health mode) processes.
 *
 * Usage:
 *   npx tsx scripts/ops/find-theses-due-health.ts                       # worklist
 *   npx tsx scripts/ops/find-theses-due-health.ts --floor 14            # custom weekly floor (days)
 *   npx tsx scripts/ops/find-theses-due-health.ts --json
 *   npx tsx scripts/ops/find-theses-due-health.ts --context <id> --type asset|macro
 *                                                                        # health bundle (signals + recent evidence + last verdict)
 */
import { closeDb } from '../lib/db.js';
import { findMonitoringThesesDueForHealthCheck, gatherHealthContext, THESIS_HEALTH_FLOOR_DAYS } from '@/lib/derived/thesisHealth';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; } else { args[key] = true; }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.context) {
    const thesisType = (args.type as string) === 'macro' ? 'macro' : 'asset';
    const ctx = await gatherHealthContext(args.context as string, thesisType);
    console.log(JSON.stringify(ctx, null, 2));
    await closeDb();
    process.exit(0);
  }

  const floor = args.floor ? Number(args.floor) : THESIS_HEALTH_FLOOR_DAYS;
  const worklist = await findMonitoringThesesDueForHealthCheck(floor);

  if (args.json) {
    console.log(JSON.stringify({ floorDays: floor, count: worklist.length, worklist }, null, 2));
    await closeDb();
    process.exit(0);
  }

  console.log(`\n=== Thesis-health worklist (floor=${floor}d) ===`);
  console.log(`${worklist.length} monitoring theses due for a health pass\n`);
  for (const t of worklist) {
    const why = t.hasNewEvidenceSince ? 'new evidence' : t.lastReviewedAt ? 'weekly floor' : 'never reviewed';
    console.log(`  [${t.thesisType}] ${t.title}  — ${t.activeSignalCount} signals, due: ${why}\n      id=${t.thesisId}`);
  }
  if (worklist.length > 0) {
    console.log(`\nAssess each via the thesis-review skill (health mode); bundle with --context <id> --type <asset|macro>.`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
