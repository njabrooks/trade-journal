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
import { pathToFileURL } from 'node:url';

/** The attention list is a ranked shortlist, not a queue — hard cap per the Lane A spec. */
export const MAX_ATTENTION_ITEMS = 5;

export interface AttentionItem {
  title: string;
  why: string;
  deepLink: string;
}

export interface BriefInput {
  briefDate?: string;
  headline: string;
  attention: AttentionItem[];
  bodyMd?: string;
  metadata?: Record<string, unknown>;
}

export interface PersistedBriefInput {
  briefDate: string;
  headline: string;
  attention: AttentionItem[];
  bodyMd: string | null;
  metadata: Record<string, unknown> | null;
}

export interface PersistedBriefRow extends PersistedBriefInput {
  id: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface MorningBriefStore {
  upsertForDate(input: PersistedBriefInput, updatedAt: Date): Promise<PersistedBriefRow>;
}

export interface SaveMorningBriefDependencies {
  store: MorningBriefStore;
  now?: Date;
}

interface MorningBriefTable {
  id: unknown;
  briefDate: unknown;
  headline: unknown;
  attention: unknown;
  bodyMd: unknown;
  metadata: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

interface MorningBriefDatabase {
  insert(table: unknown): {
    values(input: PersistedBriefInput): {
      onConflictDoUpdate(config: {
        target: unknown;
        set: Record<string, unknown>;
      }): {
        returning(selection: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
      };
    };
  };
}

function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function normalizeBriefInput(input: BriefInput): PersistedBriefInput {
  if (!input.headline || typeof input.headline !== 'string') {
    throw new Error('Brief must have a headline');
  }
  if (!Array.isArray(input.attention)) {
    throw new Error('Brief must have an attention array (may be empty)');
  }
  if (input.attention.length > MAX_ATTENTION_ITEMS) {
    throw new Error(`Attention list is ranked and capped at ${MAX_ATTENTION_ITEMS} items — got ${input.attention.length}. Rank harder.`);
  }
  for (const a of input.attention) {
    if (!a.title || !a.why || !a.deepLink) {
      throw new Error(`Attention item missing title/why/deepLink: ${JSON.stringify(a).slice(0, 120)}`);
    }
  }
  const briefDate = input.briefDate ?? londonToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(briefDate)) {
    throw new Error(`briefDate must be YYYY-MM-DD, got: ${briefDate}`);
  }

  return {
    briefDate,
    headline: input.headline,
    attention: input.attention,
    bodyMd: input.bodyMd ?? null,
    metadata: input.metadata ?? null,
  };
}

export async function saveMorningBrief(
  input: BriefInput,
  dependencies: SaveMorningBriefDependencies,
) {
  const normalized = normalizeBriefInput(input);
  const row = await dependencies.store.upsertForDate(
    normalized,
    dependencies.now ?? new Date(),
  );

  return {
    id: row.id,
    briefDate: row.briefDate,
    superseded:
      row.updatedAt !== null &&
      row.createdAt !== null &&
      row.updatedAt > row.createdAt,
    attentionItems: normalized.attention.length,
  };
}

export function createDrizzleMorningBriefStore(
  database: MorningBriefDatabase,
  table: MorningBriefTable,
): MorningBriefStore {
  return {
    async upsertForDate(values, updatedAt) {
      const [row] = await database
        .insert(table)
        .values(values)
        .onConflictDoUpdate({
          target: table.briefDate,
          set: {
            headline: values.headline,
            attention: values.attention,
            bodyMd: values.bodyMd,
            metadata: values.metadata,
            updatedAt,
          },
        })
        .returning({
          id: table.id,
          briefDate: table.briefDate,
          headline: table.headline,
          attention: table.attention,
          bodyMd: table.bodyMd,
          metadata: table.metadata,
          createdAt: table.createdAt,
          updatedAt: table.updatedAt,
        });
      return row as unknown as PersistedBriefRow;
    },
  };
}

async function main() {
  if (!process.argv.includes('--stdin')) {
    throw new Error('Pass --stdin and pipe the brief JSON');
  }

  const raw = await readStdin();
  const input = JSON.parse(raw.slice(raw.indexOf('{'))) as BriefInput;
  const { closeDb, db, schema } = await import('../lib/db.js');
  const { morningBriefs } = schema;
  const store = createDrizzleMorningBriefStore(
    db as unknown as MorningBriefDatabase,
    morningBriefs as unknown as MorningBriefTable,
  );

  console.log(JSON.stringify(await saveMorningBrief(input, { store })));
  await closeDb();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });
}
