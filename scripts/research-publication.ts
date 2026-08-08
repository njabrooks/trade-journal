#!/usr/bin/env tsx

/**
 * Deterministic read/validation boundary for governed research publication.
 *
 * This command cannot write. The only mutation boundary is
 * scripts/ops/publish-research.ts, which requires an explicit authorization.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import {
  validatePreparedResearchPublication,
  validateResearchPublicationAuthorization,
} from '../src/lib/intelligence/researchPublication.js';
import { prepareResearchPublication } from '../src/lib/intelligence/researchPublicationReadBoundary.js';

const HELP = `research-publication (read-only)

  --prepare --insight-id <uuid> --synthesis-result <file|->
  --validate-authorization <file|-> --publication <file>

There is intentionally no apply, publish, promote, link, status, decision,
strategy, position, generic SQL, Supabase MCP, API mutation, or trade mode.`;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const allowed = new Set([
    'prepare', 'insight-id', 'synthesis-result', 'validate-authorization',
    'publication', 'help',
  ]);
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
      index += 1;
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

function unavailable(reason: string, detail: string) {
  return {
    contractVersion: '1.0.0', status: 'unavailable', reason, detail,
    execution: { mode: 'refused', writes: [] },
  };
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

  if (typeof args['validate-authorization'] === 'string'
    && typeof args.publication === 'string') {
    try {
      const [publication, authorization] = await Promise.all([
        readJson(args.publication),
        readJson(args['validate-authorization']),
      ]);
      const validated = validateResearchPublicationAuthorization(
        validatePreparedResearchPublication(publication),
        authorization,
      );
      process.stdout.write(`${JSON.stringify({
        status: 'authorization_valid',
        authorization: validated,
        execution: { mode: 'read_only_validation', writes: [] },
      }, null, 2)}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify(unavailable(
        'authorization_refused',
        error instanceof Error ? error.message : String(error),
      ), null, 2)}\n`);
      process.exitCode = 2;
    }
    return;
  }

  if (args.prepare === true
    && typeof args['insight-id'] === 'string'
    && typeof args['synthesis-result'] === 'string') {
    const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    config({ path: join(projectRoot, '.env.local'), quiet: true });
    if (!process.env.DATABASE_URL_POOLER) {
      process.stdout.write(`${JSON.stringify(unavailable(
        'environment_unavailable',
        'DATABASE_URL_POOLER is unavailable; no publication readiness was inferred',
      ), null, 2)}\n`);
      process.exitCode = 2;
      return;
    }
    let closeDb: (() => Promise<void>) | undefined;
    try {
      const [synthesis, databaseModule, { createClaimsSynthesisReadRepository }] = await Promise.all([
        readJson(args['synthesis-result']),
        import('./lib/db.js'),
        import('./lib/claims-synthesis-db.js'),
      ]);
      closeDb = databaseModule.closeDb;
      const result = await prepareResearchPublication(
        args['insight-id'],
        synthesis,
        createClaimsSynthesisReadRepository(databaseModule.db),
      );
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.status === 'unavailable') process.exitCode = 2;
    } catch (error) {
      process.stdout.write(`${JSON.stringify(unavailable(
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
  process.stderr.write(`research-publication failed safely: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
