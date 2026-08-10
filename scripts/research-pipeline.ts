#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import {
  buildResearchPipelineAggregate,
  validateResearchPipelineAggregateInput,
  validateResearchPipelineAggregateResult,
} from '../src/lib/intelligence/researchPipeline.js';
import {
  buildIdeaIntakeResult,
  buildPipelineStatusResult,
  buildThesisFormalizationResult,
  buildUnknownMappingResult,
  validateResearchPipelineIntakeResult,
} from '../src/lib/intelligence/researchPipelineIntake.js';

const HELP = `research-pipeline (read-only aggregate)

Usage:
  npx tsx scripts/research-pipeline.ts --describe --insight-id <uuid>
  npx tsx scripts/research-pipeline.ts --pipeline-status <file|->
  npx tsx scripts/research-pipeline.ts --idea-intake <file|->
  npx tsx scripts/research-pipeline.ts --thesis-formalization <file|->
  npx tsx scripts/research-pipeline.ts --unknown-mapping <file|->
  npx tsx scripts/research-pipeline.ts --validate-stage-result <file|->
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    process.stdout.write(HELP);
    return;
  }
  const accepted = new Set([
    '--describe', '--insight-id', '--pipeline-status', '--idea-intake', '--thesis-formalization',
    '--unknown-mapping', '--validate-stage-result', '--evaluate', '--validate-result',
  ]);
  const unsupported = args.find((item) => item.startsWith('--') && !accepted.has(item));
  if (unsupported) throw new Error(`Unsupported option ${unsupported}`);
  const operations = [
    '--describe', '--pipeline-status', '--idea-intake', '--thesis-formalization',
    '--unknown-mapping', '--validate-stage-result', '--evaluate', '--validate-result',
  ];
  if (args.filter((item) => operations.includes(item)).length !== 1) {
    throw new Error('Exactly one read-only stage, aggregate, or validation operation is required');
  }
  if (args.includes('--insight-id') && !args.includes('--describe')) {
    throw new Error('--insight-id is supported only with --describe');
  }
  const valueOptions = new Set([
    '--insight-id', '--pipeline-status', '--idea-intake', '--thesis-formalization',
    '--unknown-mapping', '--validate-stage-result', '--evaluate', '--validate-result',
  ]);
  const valueIndexes = new Set<number>();
  args.forEach((item, index) => {
    if (valueOptions.has(item)) {
      argument(args, item);
      valueIndexes.add(index + 1);
    }
  });
  const stray = args.find((item, index) => !item.startsWith('--') && !valueIndexes.has(index));
  if (stray) throw new Error(`Unsupported positional argument ${stray}`);

  if (args.includes('--describe')) {
    const insightId = argument(args, '--insight-id');
    process.stdout.write(`${JSON.stringify(buildResearchPipelineAggregate({ insightId, dependencies: {} }), null, 2)}\n`);
    return;
  }
  const stageBuilders = [
    ['--pipeline-status', buildPipelineStatusResult],
    ['--idea-intake', buildIdeaIntakeResult],
    ['--thesis-formalization', buildThesisFormalizationResult],
    ['--unknown-mapping', buildUnknownMappingResult],
  ] as const;
  for (const [option, builder] of stageBuilders) {
    if (args.includes(option)) {
      process.stdout.write(`${JSON.stringify(builder(readJson(argument(args, option))), null, 2)}\n`);
      return;
    }
  }
  if (args.includes('--validate-stage-result')) {
    const result = validateResearchPipelineIntakeResult(readJson(argument(args, '--validate-stage-result')));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
  throw new Error('No supported operation was selected');
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
