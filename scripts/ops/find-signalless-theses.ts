#!/usr/bin/env tsx
/**
 * The signal-derivation worklist (W8 — docs/v2/07 §4b, B5).
 *
 * Monitoring theses with no active signals yet — the queue the thesis-review skill
 * (signal mode) processes to derive each thesis's qualitative signals. Splits into
 * `ready` (has claims to derive from) and `thin` (no claims — research-gap, B6/§4e;
 * never fabricate signals for these).
 *
 * Usage:
 *   npx tsx scripts/ops/find-signalless-theses.ts                       # worklist
 *   npx tsx scripts/ops/find-signalless-theses.ts --json                # machine-readable
 *   npx tsx scripts/ops/find-signalless-theses.ts --context <id> --type asset|macro [--compact]
 *                                                                        # signal-synthesis bundle (digest + parent macros)
 */
import { closeDb } from '../lib/db.js';
import { findMonitoringThesesNeedingSignals, gatherSignalContext } from '@/lib/derived/signalDerivation';

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
    const ctx = await gatherSignalContext(args.context as string, thesisType);
    if (ctx && args.compact) {
      const trim = (c: typeof ctx.supportingClaims[number]) => ({
        id: c.id, title: c.title, claim: c.claim, qualifier: c.qualifier, mappingType: c.mappingType,
        relevantTickers: c.relevantTickers, evidence: (c.evidence ?? []).slice(0, 3), rebuttal: c.rebuttal,
      });
      console.log(JSON.stringify({
        thesis: ctx.thesis,
        parentMacros: ctx.parentMacros,
        supportingClaims: ctx.supportingClaims.map(trim),
        refutingClaims: ctx.refutingClaims.map(trim),
        latestArticulation: ctx.latestArticulation
          ? { version: ctx.latestArticulation.version, coreArgument: ctx.latestArticulation.coreArgument }
          : null,
      }, null, 2));
    } else {
      console.log(JSON.stringify(ctx, null, 2));
    }
    await closeDb();
    process.exit(0);
  }

  const { ready, thin } = await findMonitoringThesesNeedingSignals();

  if (args.json) {
    console.log(JSON.stringify({ readyCount: ready.length, thinCount: thin.length, ready, thin }, null, 2));
    await closeDb();
    process.exit(0);
  }

  console.log(`\n=== Signal-derivation worklist ===`);
  console.log(`${ready.length} monitoring theses ready for signal derivation; ${thin.length} thin (research-gap)\n`);
  for (const t of ready) {
    console.log(`  [${t.thesisType}] ${t.title}  — ${t.claimCount} claims, ${t.hasDigest ? 'has digest' : 'NO digest (synthesize first)'}\n      id=${t.thesisId}`);
  }
  if (thin.length > 0) {
    console.log(`\nThin (monitoring, no claims — needs research, not fabricated signals; B6/§4e):`);
    for (const t of thin) console.log(`  [${t.thesisType}] ${t.title}  id=${t.thesisId}`);
  }
  if (ready.length > 0) {
    console.log(`\nDerive each via the thesis-review skill (signal mode); bundle with --context <id> --type <asset|macro> --compact.`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
