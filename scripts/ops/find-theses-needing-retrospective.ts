#!/usr/bin/env tsx
/**
 * The retrospective worklist (W8 — docs/v2/07 §4d, B7; episodic — docs/v2/13 §2).
 *
 * Closed EXPRESSION EPISODES (a monitoring span that ended) without a retrospective yet —
 * the queue the thesis-review skill (retrospective mode) writes "was I right, did it pay" for.
 * A thesis that closes and re-expresses surfaces once per holding period (episodeNo).
 *
 * Usage:
 *   npx tsx scripts/ops/find-theses-needing-retrospective.ts                 # worklist
 *   npx tsx scripts/ops/find-theses-needing-retrospective.ts --json
 *   npx tsx scripts/ops/find-theses-needing-retrospective.ts --context <id> --type asset|macro --episode <n>
 *                                                              # retrospective inputs windowed to the episode
 */
import { closeDb } from '../lib/db.js';
import { findThesesNeedingRetrospective, gatherRetrospectiveContext, loadEpisode } from '@/lib/derived/retrospective';

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
    // Scope the context to a specific episode when given (the worklist supplies episodeNo).
    const episode = args.episode
      ? (await loadEpisode(args.context as string, thesisType, parseInt(args.episode as string, 10))) ?? undefined
      : undefined;
    const ctx = await gatherRetrospectiveContext(args.context as string, thesisType, episode);
    console.log(JSON.stringify(ctx, null, 2));
    await closeDb();
    process.exit(0);
  }

  const items = await findThesesNeedingRetrospective();

  if (args.json) {
    console.log(JSON.stringify({ count: items.length, items }, null, 2));
    await closeDb();
    process.exit(0);
  }

  console.log(`\n=== Retrospective worklist (closed expression episodes, no retrospective yet) ===`);
  console.log(`${items.length} closed ${items.length === 1 ? 'episode' : 'episodes'} awaiting a retrospective\n`);
  for (const t of items) {
    const tk = t.ticker ? ` (${t.ticker})` : '';
    const ep = ` ep${t.episodeNo} [${t.openedAt ?? '?'}→${t.closedAt ?? '?'}]`;
    console.log(`  [${t.status}] ${t.title}${tk}${ep}  id=${t.thesisId} (${t.thesisType})`);
  }
  if (items.length > 0) {
    console.log(`\nWrite each via the thesis-review skill (retrospective mode); inputs with --context <id> --type <asset|macro> --episode <n>.`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
