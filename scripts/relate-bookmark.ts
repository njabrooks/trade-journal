/**
 * relate-bookmark CLI (docs/v2/17) — deterministic wrapper around the relateBookmark engine.
 *
 * The DETERMINISTIC parts run here: load the active thesis catalog (+ each thesis's active
 * signals), and own the candidate_signal writes. The SEMANTIC JUDGMENT (which thesis a
 * bookmark bears on, significance grade, whether a signal already covers it, the proposed
 * statement) is supplied by Claude via the /relate-bookmark skill, which reads #bookmark
 * nodes from Tana (MCP) and pipes a judged plan into --apply.
 *
 * Modes:
 *   (default)            print { catalog } JSON to stdout (active theses + their signals)
 *   --out <file>         (default mode) write the catalog JSON to a file instead of stdout
 *   --apply <file|->     apply a Claude-judged plan (BookmarkPlanEntry[]) from file/stdin
 *   --dry-run            compute + report, write nothing
 *
 * Examples:
 *   npx tsx scripts/relate-bookmark.ts --out /tmp/bm-catalog.json
 *   cat plan.json | npx tsx scripts/relate-bookmark.ts --apply - --dry-run
 *   cat plan.json | npx tsx scripts/relate-bookmark.ts --apply -
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { db, closeDb } from './lib/db.js';
import {
  loadBookmarkCatalog,
  applyBookmarkPlan,
  type BookmarkPlanEntry,
} from '../src/lib/intelligence/relateBookmark.js';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Validate a Claude-authored plan at the boundary — the only thing between free-form LLM
 * output and the belief graph. Reject the WHOLE plan (naming the offending field) rather
 * than partially applying a malformed one. Mirrors relate-research's validateJudgedLinks.
 */
function validateBookmarkPlan(parsed: unknown): BookmarkPlanEntry[] {
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { entries?: unknown }).entries)
      ? ((parsed as { entries: unknown[] }).entries)
      : null;
  if (!arr) throw new Error('plan must be a BookmarkPlanEntry[] or { "entries": BookmarkPlanEntry[] }');

  const TYPES = new Set(['macro', 'asset']);
  const SIG = new Set(['notable', 'material']);
  return arr.map((raw: unknown, i: number): BookmarkPlanEntry => {
    const at = (f: string) => `entries[${i}].${f}`;
    if (!raw || typeof raw !== 'object') throw new Error(`${at('(root)')} must be an object`);
    const e = raw as Record<string, unknown>;
    const str = (f: string): string => {
      const v = e[f];
      if (typeof v !== 'string' || !v.trim()) throw new Error(`${at(f)} must be a non-empty string`);
      return v;
    };
    const optStr = (f: string): string | null => {
      const v = e[f];
      if (v === undefined || v === null) return null;
      if (typeof v !== 'string') throw new Error(`${at(f)} must be a string when present`);
      return v;
    };
    const bookmarkNodeId = str('bookmarkNodeId');
    const thesisId = str('thesisId');
    const thesisTitle = str('thesisTitle');
    const statement = str('statement');
    const thesisType = e['thesisType'];
    if (typeof thesisType !== 'string' || !TYPES.has(thesisType)) throw new Error(`${at('thesisType')} must be "macro" or "asset"`);
    const significance = e['significance'];
    if (typeof significance !== 'string' || !SIG.has(significance)) throw new Error(`${at('significance')} must be "notable" or "material" (trivial bookmarks are left in Tana, not applied)`);
    return {
      bookmarkNodeId,
      bookmarkTitle: optStr('bookmarkTitle') ?? undefined,
      thesisId,
      thesisType: thesisType as 'macro' | 'asset',
      thesisTitle,
      statement,
      significance: significance as 'notable' | 'material',
      sourceUrl: optStr('sourceUrl'),
      observedAt: optStr('observedAt'),
      rationale: optStr('rationale'),
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = !!args['dry-run'];

  // --- apply a Claude-judged plan -------------------------------------------
  if (typeof args.apply === 'string' || args.apply === true) {
    const src = args.apply;
    const raw = src === '-' || src === true ? await readStdin() : readFileSync(src as string, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error(`relate-bookmark: plan is not valid JSON — ${(e as Error).message}`);
      await closeDb();
      process.exit(1);
    }
    let entries: BookmarkPlanEntry[];
    try {
      entries = validateBookmarkPlan(parsed);
    } catch (e) {
      console.error(`relate-bookmark: invalid plan — ${(e as Error).message}. Nothing applied.`);
      await closeDb();
      process.exit(1);
    }
    console.error(`relate-bookmark: applying ${entries.length} judged candidate(s)${dryRun ? ' (dry-run)' : ''}`);
    const summary = await applyBookmarkPlan(db, entries, { dryRun });
    process.stdout.write(JSON.stringify({ mode: 'apply', dryRun, ...summary }, null, 2) + '\n');
    await closeDb();
    process.exit(0);
  }

  // --- catalog mode (default) -----------------------------------------------
  // Emit the active thesis set + each thesis's active signals. The skill reads #bookmark
  // nodes from Tana, judges each against this catalog, and pipes a plan back via --apply.
  const catalog = await loadBookmarkCatalog(db);
  const sigCount = catalog.reduce((n, t) => n + t.signals.length, 0);
  console.error(`relate-bookmark catalog: ${catalog.length} active theses, ${sigCount} active signals.`);

  const json = JSON.stringify({ catalog }, null, 2);
  if (typeof args.out === 'string') {
    writeFileSync(args.out, json);
    console.error(`Wrote catalog → ${args.out}`);
  } else {
    process.stdout.write(json + '\n');
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
