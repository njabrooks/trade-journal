/**
 * relate-research CLI (W8) — deterministic wrapper around the relateResearch engine.
 *
 * The DETERMINISTIC parts run here / schedulably. The SEMANTIC JUDGMENT (which
 * developing-thesis link, supports vs refutes, confidence) is supplied by Claude
 * via the /relate-research skill, which pipes a judged plan into --apply.
 *
 * Selection:
 *   --insight-ids <id,id,...>      explicit insight ids
 *   --since <YYYY-MM-DD>           insights with claims_structure created on/after
 *   --limit <n>                    cap for --since (default 25)
 *
 * Modes:
 *   (default) --worksheet          print ClaimWorksheet[] JSON to stdout (no writes)
 *   --apply-signals                apply the deterministic monitoring/signal route
 *   --apply <file|->               apply a Claude-judged plan (JudgedLink[]) from file/stdin
 *   --dry-run                      compute + report, write nothing
 *   --out <file>                   (worksheet mode) write JSON to a file instead of stdout
 *
 * Examples:
 *   npx tsx scripts/relate-research.ts --since 2026-06-10 --worksheet --out /tmp/ws.json
 *   npx tsx scripts/relate-research.ts --insight-ids abc,def --apply-signals --dry-run
 *   cat plan.json | npx tsx scripts/relate-research.ts --apply -
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { and, desc, gte, isNotNull } from 'drizzle-orm';
import { db, closeDb, schema } from './lib/db.js';
import {
  loadCandidateClaimsFromInsights,
  prepareWorksheets,
  applySignalEvidence,
  applyJudgedPlan,
  getActiveThesisCatalog,
  type JudgedLink,
} from '../src/lib/intelligence/relateResearch.js';

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

async function selectInsightIds(args: Record<string, string | boolean>): Promise<string[]> {
  if (typeof args['insight-ids'] === 'string') {
    return args['insight-ids'].split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (typeof args.since === 'string') {
    const since = new Date(args.since + 'T00:00:00Z');
    const limit = typeof args.limit === 'string' ? parseInt(args.limit, 10) : 25;
    const rows = await db
      .select({ id: schema.researchInsights.id })
      .from(schema.researchInsights)
      .where(and(isNotNull(schema.researchInsights.claimsStructure), gte(schema.researchInsights.createdAt, since)))
      .orderBy(desc(schema.researchInsights.createdAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }
  return [];
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Validate a Claude-authored plan at the boundary — this is the only thing between
 * free-form LLM output and the belief graph. Reject the WHOLE plan (naming the offending
 * field) rather than partially applying a malformed one.
 */
function validateJudgedLinks(parsed: unknown): JudgedLink[] {
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { links?: unknown }).links)
      ? ((parsed as { links: unknown[] }).links)
      : null;
  if (!arr) throw new Error('plan must be a JudgedLink[] or { "links": JudgedLink[] }');

  const TYPES = new Set(['macro', 'asset']);
  const MAPS = new Set(['supports', 'refutes', 'foundation']);
  return arr.map((l: any, i: number): JudgedLink => {
    const at = (f: string) => `links[${i}].${f}`;
    const str = (f: string): string => {
      if (typeof l?.[f] !== 'string' || !l[f].trim()) throw new Error(`${at(f)} must be a non-empty string`);
      return l[f];
    };
    const insightId = str('insightId');
    const sourceClaimId = str('sourceClaimId');
    const thesisId = str('thesisId');
    const thesisTitle = str('thesisTitle');
    if (!TYPES.has(l?.thesisType)) throw new Error(`${at('thesisType')} must be "macro" or "asset"`);
    if (!MAPS.has(l?.mappingType)) throw new Error(`${at('mappingType')} must be supports|refutes|foundation`);
    const confidence = l?.confidence;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)
      throw new Error(`${at('confidence')} must be a number in [0,1]`);
    return {
      insightId,
      sourceClaimId,
      thesisId,
      thesisTitle,
      thesisType: l.thesisType,
      mappingType: l.mappingType,
      confidence,
      reasoning: typeof l?.reasoning === 'string' ? l.reasoning : '',
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = !!args['dry-run'];

  // --- apply a Claude-judged plan -------------------------------------------
  if (typeof args.apply === 'string') {
    const raw = args.apply === '-' ? await readStdin() : readFileSync(args.apply, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error(`relate-research: plan is not valid JSON — ${(e as Error).message}`);
      await closeDb();
      process.exit(1);
    }
    let links: JudgedLink[];
    try {
      links = validateJudgedLinks(parsed);
    } catch (e) {
      console.error(`relate-research: invalid plan — ${(e as Error).message}. Nothing applied.`);
      await closeDb();
      process.exit(1);
    }
    console.error(`relate-research: applying ${links.length} judged link(s)${dryRun ? ' (dry-run)' : ''}`);
    const summary = await applyJudgedPlan(links, { dryRun }, db);
    process.stdout.write(JSON.stringify({ mode: 'apply', dryRun, ...summary }, null, 2) + '\n');
    await closeDb();
    process.exit(0);
  }

  // --- selection for worksheet / signal modes -------------------------------
  const insightIds = await selectInsightIds(args);
  if (insightIds.length === 0) {
    // Don't hard-fail: worksheet mode still emits the catalog (+ empty claims) so a
    // downstream Read has a file, and apply-signals reports 0/0. Just flag it loudly.
    console.error('relate-research: no insights selected for the given --since/--insight-ids — emitting an empty result.');
  }

  const claims = await loadCandidateClaimsFromInsights(insightIds, db);
  const worksheets = await prepareWorksheets(claims, db);

  // --- deterministic signal route -------------------------------------------
  if (args['apply-signals']) {
    console.error(`relate-research: applying signal evidence for ${worksheets.length} claim(s)${dryRun ? ' (dry-run)' : ''}`);
    const res = await applySignalEvidence(worksheets, { dryRun }, db);
    process.stdout.write(JSON.stringify({ mode: 'apply-signals', dryRun, ...res }, null, 2) + '\n');
    await closeDb();
    process.exit(0);
  }

  // --- worksheet mode (default) ---------------------------------------------
  // Emit the full active thesis catalog + per-claim payloads. The skill judges each
  // claim against the catalog (Claude, not keyword matching) and pipes back a plan.
  const catalog = await getActiveThesisCatalog(db);
  const withSignals = worksheets.filter((w) => w.monitoringSignalMatches.length > 0).length;
  console.error(
    `relate-research worksheet: ${claims.length} claim(s) from ${insightIds.length} insight(s); ` +
      `${catalog.length} active theses in catalog; ${withSignals} claim(s) with ticker-matched signal hits.`,
  );

  const json = JSON.stringify({ catalog, claims: worksheets }, null, 2);
  if (typeof args.out === 'string') {
    writeFileSync(args.out, json);
    console.error(`Wrote worksheets → ${args.out}`);
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
