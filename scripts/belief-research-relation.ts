#!/usr/bin/env tsx

/** Deterministic read/result boundary for governed belief-research relation. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import {
  createUnavailableBeliefResearchRelationResult,
  prepareBeliefResearchRelationRecording,
  validateBeliefResearchRelationRecordingAuthorization,
  validateBeliefResearchRelationResult,
  validatePreparedBeliefResearchRelationRecording,
} from '../src/lib/intelligence/beliefResearchRelation.js';
import {
  prepareBeliefResearchRelationContext,
  validatePreparedBeliefResearchRelationContext,
} from '../src/lib/intelligence/beliefResearchRelationReadBoundary.js';

const HELP = `belief-research-relation (read-only)

  --prepare --insight-id <uuid>
  --validate-result <file|-> --context <file>
  --prepare-recording --result <file|-> --context <file>
  --validate-authorization <file|-> --recording <file>

There is intentionally no apply, claim creation, status change, decision resolution,
strategy, position, SQL, Supabase MCP, API mutation, generic write, or trade mode.`;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const allowed = new Set([
    'prepare', 'insight-id', 'validate-result', 'context', 'prepare-recording',
    'result', 'validate-authorization', 'recording', 'help',
  ]);
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected positional argument: ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`Unsupported option --${key}; this boundary is read-only`);
    if (['prepare', 'prepare-recording', 'help'].includes(key)) {
      args[key] = true;
    } else {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`--${key} requires a value`);
      args[key] = next; index += 1;
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
  return JSON.parse(path === '-' ? await readStdin() : readFileSync(path, 'utf8')) as unknown;
}

async function main(): Promise<void> {
  let args: Record<string, string | boolean>;
  try { args = parseArgs(process.argv.slice(2)); } catch (error) {
    process.stderr.write(`${(error as Error).message}\n${HELP}\n`); process.exitCode = 1; return;
  }
  if (args.help) { process.stdout.write(`${HELP}\n`); return; }

  if (typeof args['validate-result'] === 'string' && typeof args.context === 'string') {
    try {
      const [prepared, result] = await Promise.all([
        readJson(args.context), readJson(args['validate-result']),
      ]);
      const validated = validateBeliefResearchRelationResult(
        validatePreparedBeliefResearchRelationContext(prepared), result as never,
      );
      process.stdout.write(`${JSON.stringify(validated, null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`belief-research-relation validation refused: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (args['prepare-recording'] === true
    && typeof args.result === 'string' && typeof args.context === 'string') {
    try {
      const [prepared, result] = await Promise.all([readJson(args.context), readJson(args.result)]);
      const context = validatePreparedBeliefResearchRelationContext(prepared);
      process.stdout.write(`${JSON.stringify(prepareBeliefResearchRelationRecording(
        context, validateBeliefResearchRelationResult(context, result as never),
      ), null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`belief-research-relation recording preparation refused: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (typeof args['validate-authorization'] === 'string' && typeof args.recording === 'string') {
    try {
      const [recording, authorization] = await Promise.all([
        readJson(args.recording), readJson(args['validate-authorization']),
      ]);
      const validated = validateBeliefResearchRelationRecordingAuthorization(
        validatePreparedBeliefResearchRelationRecording(recording), authorization,
      );
      process.stdout.write(`${JSON.stringify({
        status: 'authorization_valid', authorization: validated,
        execution: { mode: 'read_only_validation', writes: [] },
      }, null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`belief-research-relation authorization refused: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (args.prepare === true && typeof args['insight-id'] === 'string') {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    config({ path: join(root, '.env.local'), quiet: true });
    if (!process.env.DATABASE_URL_POOLER) {
      process.stdout.write(`${JSON.stringify(createUnavailableBeliefResearchRelationResult(
        'environment_unavailable', 'DATABASE_URL_POOLER is unavailable; no repository state was inferred',
      ), null, 2)}\n`);
      process.exitCode = 2; return;
    }
    let closeDb: (() => Promise<void>) | undefined;
    try {
      const database = await import('./lib/db.js'); closeDb = database.closeDb;
      const { createBeliefResearchRelationReadRepository } = await import('./lib/belief-research-relation-db.js');
      const prepared = await prepareBeliefResearchRelationContext(
        args['insight-id'], createBeliefResearchRelationReadRepository(database.db),
      );
      process.stdout.write(`${JSON.stringify(prepared, null, 2)}\n`);
      if (prepared.status === 'unavailable') process.exitCode = 2;
    } catch (error) {
      process.stdout.write(`${JSON.stringify(createUnavailableBeliefResearchRelationResult(
        'database_unavailable', error instanceof Error ? error.message : String(error),
      ), null, 2)}\n`);
      process.exitCode = 2;
    } finally { await closeDb?.(); }
    return;
  }

  process.stderr.write(`Choose exactly one complete mode.\n${HELP}\n`); process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`belief-research-relation failed safely: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
