#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { validatePortfolioAnalysisResult } from '../src/lib/portfolioAnalysis.js';

async function main(): Promise<void> {
  if (!process.argv.includes('--validate-result')) {
    throw new Error('Use --validate-result with { context, result } JSON on stdin.');
  }
  const input = JSON.parse(readFileSync(0, 'utf8')) as {
    context: unknown;
    result: unknown;
  };
  const result = validatePortfolioAnalysisResult(input.context, input.result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
