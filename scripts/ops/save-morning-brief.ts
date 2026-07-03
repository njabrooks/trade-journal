#!/usr/bin/env tsx
/**
 * save-morning-brief — persist the /morning-brief skill's synthesis (docs/v2/20 §A3).
 *
 * Reads JSON from stdin:
 * {
 *   "briefDate": "2026-07-03",            // optional — defaults to today (Europe/London)
 *   "headline": "one-sentence headline",
 *   "attention": [{ "title": "...", "why": "...", "deepLink": "/thesis GLXY" }],  // ranked, ≤5
 *   "bodyMd": "## NAV\n...",
 *   "metadata": { ... }                   // optional provenance
 * }
 *
 * ONE row per day: upserts on brief_date, so re-running the same day supersedes.
 * This is the brief's ONLY write surface — it never touches the belief layer.
 *
 * Usage: cat brief.json | npx tsx scripts/ops/save-morning-brief.ts --stdin
 */
import { closeDb, db, schema } from '../lib/db.js';

const { morningBriefs } = schema;

/** The attention list is a ranked shortlist, not a queue — hard cap per the Lane A spec. */
export const MAX_ATTENTION_ITEMS = 5;

interface AttentionItem {
  title: string;
  why: string;
  deepLink: string;
}

interface BriefInput {
  briefDate?: string;
  headline: string;
  attention: AttentionItem[];
  bodyMd?: string;
  metadata?: Record<string, unknown>;
}

function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  if (!process.argv.includes('--stdin')) {
    console.error('Pass --stdin and pipe the brief JSON');
    process.exit(1);
  }

  const raw = await readStdin();
  const input = JSON.parse(raw.slice(raw.indexOf('{'))) as BriefInput;

  if (!input.headline || typeof input.headline !== 'string') {
    console.error('Brief must have a headline');
    process.exit(1);
  }
  if (!Array.isArray(input.attention)) {
    console.error('Brief must have an attention array (may be empty)');
    process.exit(1);
  }
  if (input.attention.length > MAX_ATTENTION_ITEMS) {
    console.error(`Attention list is ranked and capped at ${MAX_ATTENTION_ITEMS} items — got ${input.attention.length}. Rank harder.`);
    process.exit(1);
  }
  for (const a of input.attention) {
    if (!a.title || !a.why || !a.deepLink) {
      console.error(`Attention item missing title/why/deepLink: ${JSON.stringify(a).slice(0, 120)}`);
      process.exit(1);
    }
  }
  const briefDate = input.briefDate ?? londonToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(briefDate)) {
    console.error(`briefDate must be YYYY-MM-DD, got: ${briefDate}`);
    process.exit(1);
  }

  const [row] = await db
    .insert(morningBriefs)
    .values({
      briefDate,
      headline: input.headline,
      attention: input.attention,
      bodyMd: input.bodyMd ?? null,
      metadata: input.metadata ?? null,
    })
    .onConflictDoUpdate({
      target: morningBriefs.briefDate,
      set: {
        headline: input.headline,
        attention: input.attention,
        bodyMd: input.bodyMd ?? null,
        metadata: input.metadata ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: morningBriefs.id,
      briefDate: morningBriefs.briefDate,
      createdAt: morningBriefs.createdAt,
      updatedAt: morningBriefs.updatedAt,
    });

  console.log(
    JSON.stringify({
      id: row.id,
      briefDate: row.briefDate,
      superseded: row.updatedAt !== null && row.createdAt !== null && row.updatedAt > row.createdAt,
      attentionItems: input.attention.length,
    })
  );
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
