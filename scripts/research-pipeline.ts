#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import {
  buildResearchPipelineAggregate,
  validateResearchPipelineAggregateInput,
  validateResearchPipelineAggregateResult,
} from '../src/lib/intelligence/researchPipeline.js';

const HELP = `research-pipeline (read-only aggregate)

Usage:
  npx tsx scripts/research-pipeline.ts --describe --insight-id <uuid>
  npx tsx scripts/research-pipeline.ts --evaluate <file|->
  npx tsx scripts/research-pipeline.ts --validate-result <file|->

There is intentionally no apply, publish, relation, status, decision, strategy, position, trade,
scheduler, credential, provider-discovery, SQL, Supabase MCP, direct API, or generic write mode.
`;

function readJson(path: string): unknown {
  const text = path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
  return JSON.parse(text) as unknown;
}

function argument(args: string[], option: string): string {
  const index = args.indexOf(option);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    process.stdout.write(HELP);
    return;
  }
  const accepted = new Set(['--describe', '--insight-id', '--evaluate', '--validate-result']);
  const unsupported = args.find((item) => item.startsWith('--') && !accepted.has(item));
  if (unsupported) throw new Error(`Unsupported option ${unsupported}`);

  if (args.includes('--describe')) {
    const insightId = argument(args, '--insight-id');
    process.stdout.write(`${JSON.stringify(buildResearchPipelineAggregate({ insightId, dependencies: {} }), null, 2)}\n`);
    return;
  }
  if (args.includes('--evaluate')) {
    const input = validateResearchPipelineAggregateInput(readJson(argument(args, '--evaluate')));
    process.stdout.write(`${JSON.stringify(buildResearchPipelineAggregate(input), null, 2)}\n`);
    return;
  }
  if (args.includes('--validate-result')) {
    const result = validateResearchPipelineAggregateResult(readJson(argument(args, '--validate-result')));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new Error('Exactly one of --describe, --evaluate, or --validate-result is required');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
