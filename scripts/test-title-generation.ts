#!/usr/bin/env npx tsx

/**
 * Test Title Generation Functions
 *
 * Simple unit tests for auto-generated title logic
 * Part of Phase 2.6.3: Auto-Generated Titles
 *
 * Usage:
 *   npx tsx scripts/test-title-generation.ts
 */

import {
  generateAssetViewTitle,
  generateMacroThesisTitle,
  canGenerateAssetViewTitle,
  canGenerateMacroThesisTitle,
} from '../src/lib/utils/title-generation';

// ANSI colors for output
const green = '\x1b[32m';
const red = '\x1b[31m';
const blue = '\x1b[34m';
const reset = '\x1b[0m';

let passedTests = 0;
let failedTests = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`${green}✓${reset} ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`${red}✗${reset} ${name}`);
    console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    failedTests++;
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected "${expected}" but got "${actual}"`
    );
  }
}

function assertTrue(value: boolean, message?: string) {
  if (!value) {
    throw new Error(message || 'Expected true but got false');
  }
}

function assertFalse(value: boolean, message?: string) {
  if (value) {
    throw new Error(message || 'Expected false but got true');
  }
}

console.log(`${blue}========================================${reset}`);
console.log(`${blue}Testing Title Generation Functions${reset}`);
console.log(`${blue}========================================${reset}\n`);

// ============================================================================
// Asset View Title Generation Tests
// ============================================================================

console.log('Asset View Title Generation:\n');

test('generates title with all fields', () => {
  const title = generateAssetViewTitle({
    direction: 'bullish',
    ticker: 'TSLA',
    timeHorizon: 'medium_term',
  });
  assertEqual(title, 'Bullish TSLA Medium Term');
});

test('generates title without direction', () => {
  const title = generateAssetViewTitle({
    direction: null,
    ticker: 'AAPL',
    timeHorizon: 'long_term',
  });
  assertEqual(title, 'AAPL Long Term');
});

test('generates title without time horizon', () => {
  const title = generateAssetViewTitle({
    direction: 'bearish',
    ticker: 'SPY',
    timeHorizon: null,
  });
  assertEqual(title, 'Bearish SPY');
});

test('generates title with only ticker', () => {
  const title = generateAssetViewTitle({
    direction: null,
    ticker: 'NVDA',
    timeHorizon: null,
  });
  assertEqual(title, 'NVDA');
});

test('returns fallback when ticker is missing', () => {
  const title = generateAssetViewTitle({
    direction: 'bullish',
    ticker: null,
    timeHorizon: 'medium_term',
  });
  assertEqual(title, 'Untitled Asset View');
});

test('validates asset view can generate title with ticker', () => {
  assertTrue(canGenerateAssetViewTitle({
    direction: null,
    ticker: 'BTC',
    timeHorizon: null,
  }));
});

test('validates asset view cannot generate title without ticker', () => {
  assertFalse(canGenerateAssetViewTitle({
    direction: 'bullish',
    ticker: null,
    timeHorizon: 'long_term',
  }));
});

// ============================================================================
// Macro Thesis Title Generation Tests
// ============================================================================

console.log('\nMacro Thesis Title Generation:\n');

test('generates title with all fields', () => {
  const title = generateMacroThesisTitle({
    direction: 'bullish',
    sectors: ['US Inflation'],
    timeHorizon: 'medium_term',
  });
  assertEqual(title, 'Bullish US Inflation Medium Term');
});

test('generates title without direction', () => {
  const title = generateMacroThesisTitle({
    direction: null,
    sectors: ['AI Infrastructure'],
    timeHorizon: 'long_term',
  });
  assertEqual(title, 'AI Infrastructure Long Term');
});

test('generates title without time horizon', () => {
  const title = generateMacroThesisTitle({
    direction: 'bearish',
    sectors: ['Chinese Tech'],
    timeHorizon: null,
  });
  assertEqual(title, 'Bearish Chinese Tech');
});

test('uses first sector when multiple provided', () => {
  const title = generateMacroThesisTitle({
    direction: 'neutral',
    sectors: ['US Rates', 'European Bonds'],
    timeHorizon: 'short_term',
  });
  assertEqual(title, 'Neutral US Rates Short Term');
});

test('generates title with only sector', () => {
  const title = generateMacroThesisTitle({
    direction: null,
    sectors: ['Crypto'],
    timeHorizon: null,
  });
  assertEqual(title, 'Crypto');
});

test('returns fallback when sectors are missing', () => {
  const title = generateMacroThesisTitle({
    direction: 'bullish',
    sectors: null,
    timeHorizon: 'long_term',
  });
  assertEqual(title, 'Untitled Macro Thesis');
});

test('returns fallback when sectors array is empty', () => {
  const title = generateMacroThesisTitle({
    direction: 'bullish',
    sectors: [],
    timeHorizon: 'long_term',
  });
  assertEqual(title, 'Untitled Macro Thesis');
});

test('validates macro thesis can generate title with sectors', () => {
  assertTrue(canGenerateMacroThesisTitle({
    direction: null,
    sectors: ['Energy Transition'],
    timeHorizon: null,
  }));
});

test('validates macro thesis cannot generate title without sectors', () => {
  assertFalse(canGenerateMacroThesisTitle({
    direction: 'bullish',
    sectors: null,
    timeHorizon: 'medium_term',
  }));
});

test('validates macro thesis cannot generate title with empty sectors', () => {
  assertFalse(canGenerateMacroThesisTitle({
    direction: 'bearish',
    sectors: [],
    timeHorizon: 'short_term',
  }));
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${blue}========================================${reset}`);
console.log(`${blue}Test Summary${reset}`);
console.log(`${blue}========================================${reset}`);
console.log(`Total tests: ${passedTests + failedTests}`);
console.log(`${green}Passed: ${passedTests}${reset}`);
console.log(`${red}Failed: ${failedTests}${reset}`);

if (failedTests === 0) {
  console.log(`\n${green}✅ All tests passed!${reset}`);
  process.exit(0);
} else {
  console.log(`\n${red}❌ Some tests failed${reset}`);
  process.exit(1);
}
