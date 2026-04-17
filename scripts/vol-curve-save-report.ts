#!/usr/bin/env tsx
/**
 * Save a vol curve analysis report to the database.
 *
 * Usage:
 *   npx tsx scripts/vol-curve-save-report.ts /tmp/vol-report.json
 *   npx tsx scripts/vol-curve-save-report.ts --stdin < /tmp/vol-report.json
 *   npx tsx scripts/vol-curve-save-report.ts /tmp/vol-report.json --notes "Initial IBIT analysis"
 */

import { db, closeDb, schema } from './lib/db.js';
import { readFileSync } from 'fs';

async function main() {
  const args = process.argv.slice(2);
  const useStdin = args.includes('--stdin');
  const notesIdx = args.indexOf('--notes');
  const notes = notesIdx >= 0 ? args[notesIdx + 1] : null;
  const filePath = args.find(a => !a.startsWith('--') && (notesIdx < 0 || args.indexOf(a) !== notesIdx + 1));

  let jsonStr: string;
  if (useStdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    jsonStr = Buffer.concat(chunks).toString('utf-8');
  } else if (filePath) {
    jsonStr = readFileSync(filePath, 'utf-8');
  } else {
    console.error('Usage: npx tsx scripts/vol-curve-save-report.ts <file.json> [--notes "..."]');
    process.exit(1);
  }

  // Filter dotenv noise
  const cleanJson = jsonStr.split('\n').filter(l => !l.startsWith('[dotenv')).join('\n');
  const reportData = JSON.parse(cleanJson);

  if (!reportData.context || !reportData.strategies) {
    console.error('Invalid report data — missing context or strategies');
    process.exit(1);
  }

  const ctx = reportData.context;
  const thesis = reportData.thesis;
  const topStrategy = reportData.strategies[0];

  const [inserted] = await db
    .insert(schema.volCurveReports)
    .values({
      ticker: ctx.ticker,
      direction: thesis.direction,
      targetBase: String(thesis.targetBase),
      targetHigh: String(thesis.targetHigh),
      horizonMonths: String(thesis.horizonMonths),
      downsideFloor: String(thesis.downsideFloor),
      spot: String(ctx.spot),
      iv30: ctx.iv30 != null ? String(ctx.iv30) : null,
      rv20: ctx.rv20 != null ? String(ctx.rv20) : null,
      ivRvRatio: ctx.ivRvRatio != null ? String(ctx.ivRvRatio) : null,
      ivRank: reportData.volRank?.ivRank != null ? String(reportData.volRank.ivRank) : null,
      strategyCount: reportData.strategies.length,
      topStrategyLabel: topStrategy?.label || null,
      topStrategyType: topStrategy?.type || null,
      reportData,
      notes,
    })
    .returning({ id: schema.volCurveReports.id });

  console.log(JSON.stringify({ id: inserted!.id, ticker: ctx.ticker }));

  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Error:', err);
  await closeDb();
  process.exit(1);
});
