#!/usr/bin/env tsx
/**
 * The signal-quality worklist (docs/v2/15 — P1 of the self-improving loop).
 *
 * Reads each active monitoring thesis's snapshot history and flags where the SIGNAL
 * SET itself is weak:
 *   - chronic-neutral signals (observed ≥ MIN over the window, never discriminated);
 *   - price coverage-gaps (a vol-scaled material move no signal flagged — ASSET only;
 *     macro coverage waits on P2's news path).
 * Theses with either become `re_underwrite_due` triggers (trigger='signal_quality'),
 * surfaced by /maintenance and /decisions alongside the claim-delta re-underwrite path.
 *
 * DETERMINISTIC — no LLM here; the judgment is the re-underwrite the trigger invites.
 * Data-gated: until a signal has accumulated enough real observe history it is
 * `insufficient_data` and never flagged (docs/v2/15 §2) — expect a quiet worklist
 * until observe history matures.
 *
 * Import order matters: ../lib/db.js loads dotenv before @/db resolves.
 *
 * Usage:
 *   npx tsx scripts/ops/find-signal-quality-issues.ts                 # triggers (human)
 *   npx tsx scripts/ops/find-signal-quality-issues.ts --json          # triggers (JSON)
 *   npx tsx scripts/ops/find-signal-quality-issues.ts --all --json    # every assessable thesis
 *   npx tsx scripts/ops/find-signal-quality-issues.ts --context <id> --type <asset|macro>
 */
import { closeDb } from '../lib/db.js';
import { computeSignalQualityDiagnostics, gatherSignalQualityContext } from '@/lib/derived/signalQualityDiagnostics';

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

  // --context: single-thesis detail (for /thesis re-underwrite + inspection)
  if (args.context) {
    const type = (args.type as string) === 'macro' ? 'macro' : 'asset';
    const ctx = await gatherSignalQualityContext(args.context as string, type);
    console.log(JSON.stringify(ctx, null, 2));
    await closeDb();
    process.exit(0);
  }

  const all = await computeSignalQualityDiagnostics();
  const showAll = !!args.all;
  const list = showAll ? all : all.filter((t) => t.reunderwriteTrigger);

  if (args.json) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      assessableTheses: all.length,
      triggerCount: all.filter((t) => t.reunderwriteTrigger).length,
      shown: list.length,
      theses: list,
    }, null, 2));
    await closeDb();
    process.exit(0);
  }

  // Human-readable
  const triggers = all.filter((t) => t.reunderwriteTrigger);
  console.log(`\nSignal-quality worklist — ${all.length} assessable thesis(es), ${triggers.length} with a re-underwrite trigger\n`);
  for (const t of list) {
    const tag = t.thesisType === 'asset' ? (t.ticker ?? 'asset') : 'macro';
    const flag = t.reunderwriteTrigger ? '⚠️ ' : '   ';
    console.log(`${flag}[${tag}] ${t.title}`);
    if (t.reason) console.log(`      → ${t.reason}`);
    for (const s of t.chronicNeutralSignals) {
      console.log(`      · ${s.verdict} (${s.nonNeutralCount}/${s.observedCount} non-neutral): ${s.statement.slice(0, 80)}`);
    }
    if (showAll && !t.reunderwriteTrigger) {
      const counts = t.signals.reduce<Record<string, number>>((m, s) => { m[s.verdict] = (m[s.verdict] ?? 0) + 1; return m; }, {});
      console.log(`      · ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no signals'}`);
    }
  }
  console.log('');

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
