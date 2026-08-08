#!/usr/bin/env tsx

/**
 * Deterministic read/validation boundary for governed claims synthesis.
 *
 * This command has no write mode. It prepares Notes-owned source evidence plus
 * the Trade Journal claim/thesis catalog, or validates a recommendation-only
 * provider result against the exact prepared context.
 *
 * Usage:
 *   npx tsx scripts/claims-synthesis.ts --prepare --insight-id <uuid>
 *   npx tsx scripts/claims-synthesis.ts --validate-result <file|-> --context <file>
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import {
  createUnavailableClaimsSynthesisResult,
  validateClaimsSynthesisResult,
  type ClaimsSynthesisContext,
} from '../src/lib/intelligence/claimsSynthesis.js';
import { prepareClaimsSynthesisContext } from '../src/lib/intelligence/claimsSynthesisReadBoundary.js';

const HELP = `claims-synthesis (read-only)

  --prepare --insight-id <uuid>
  --validate-result <file|-> --context <file>

There is intentionally no apply, promote, link, status, decision, strategy,
position, SQL, Supabase MCP, API mutation, or trade mode.`;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const allowed = new Set(['prepare', 'insight-id', 'validate-result', 'context', 'help']);
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected positional argument: ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`Unsupported option --${key}; this boundary is read-only`);
    const next = argv[index + 1];
    if (key === 'prepare' || key === 'help') {
      args[key] = true;
    } else {
      if (!next || next.startsWith('--')) throw new Error(`--${key} requires a value`);
      args[key] = next;
      index++;
    }
  }
  return args;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(path: string): Promise<unknown> {
  const raw = path === '-' ? await readStdin() : readFileSync(path, 'utf8');
  return JSON.parse(raw) as unknown;
}

function contextFrom(value: unknown): ClaimsSynthesisContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('context file must contain a claims-synthesis context object');
  }
  const record = value as Record<string, unknown>;
  const context = record.status === 'ready' && record.context ? record.context : value;
  return context as ClaimsSynthesisContext;
}

async function main(): Promise<void> {
  let args: Record<string, string | boolean>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n${HELP}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  if (typeof args['validate-result'] === 'string' && typeof args.context === 'string') {
    try {
      const [contextValue, resultValue] = await Promise.all([
        readJson(args.context),
        readJson(args['validate-result']),
      ]);
      const result = validateClaimsSynthesisResult(contextFrom(contextValue), resultValue);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`claims-synthesis validation refused: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (args.prepare === true && typeof args['insight-id'] === 'string') {
    const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    config({ path: join(projectRoot, '.env.local'), quiet: true });
    if (!process.env.DATABASE_URL_POOLER) {
      process.stdout.write(`${JSON.stringify(createUnavailableClaimsSynthesisResult(
        'environment_unavailable',
        'DATABASE_URL_POOLER is unavailable; no database state was inferred',
      ), null, 2)}\n`);
      process.exitCode = 2;
      return;
    }

    let closeDb: (() => Promise<void>) | undefined;
    try {
      const databaseModule = await import('./lib/db.js');
      closeDb = databaseModule.closeDb;
      const { createClaimsSynthesisReadRepository } = await import('./lib/claims-synthesis-db.js');
      const prepared = await prepareClaimsSynthesisContext(
        args['insight-id'],
        createClaimsSynthesisReadRepository(databaseModule.db),
      );
      process.stdout.write(`${JSON.stringify(prepared, null, 2)}\n`);
      if (prepared.status === 'unavailable') process.exitCode = 2;
    } catch (error) {
      process.stdout.write(`${JSON.stringify(createUnavailableClaimsSynthesisResult(
        'database_unavailable',
        error instanceof Error ? error.message : String(error),
      ), null, 2)}\n`);
      process.exitCode = 2;
    } finally {
      await closeDb?.();
    }
    return;
  }

  process.stderr.write(`Choose exactly one complete mode.\n${HELP}\n`);
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`claims-synthesis failed safely: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
