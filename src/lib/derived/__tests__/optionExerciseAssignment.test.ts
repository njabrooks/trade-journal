import { describe, expect, it } from 'vitest';
import {
  matchStockExerciseAssignmentToOptionStrategy,
  parseListedOptionSymbol,
  type ExerciseAssignmentTrade,
} from '@/lib/derived/optionExerciseAssignment';

const trade = (overrides: Partial<ExerciseAssignmentTrade>): ExerciseAssignmentTrade => ({
  id: 'trade',
  accountId: 'acct',
  strategyId: null,
  symbol: 'CAT',
  assetClass: 'STK',
  side: 'BUY',
  quantity: 1,
  price: 1,
  tradeDate: '2026-06-18',
  rawRow: {},
  ...overrides,
});

describe('parseListedOptionSymbol', () => {
  it('parses IBKR/OCC-style option symbols', () => {
    expect(parseListedOptionSymbol('CAT   260618C00900000')).toEqual({
      ticker: 'CAT',
      expiryCode: '260618',
      right: 'C',
      strike: 900,
    });
  });
});

describe('matchStockExerciseAssignmentToOptionStrategy', () => {
  it('matches exercised long calls to the option strategy', () => {
    const result = matchStockExerciseAssignmentToOptionStrategy(
      trade({
        id: 'stock-ex',
        side: 'BUY',
        quantity: 500,
        price: 900,
        rawRow: { 'Notes/Codes': 'Ex' },
      }),
      [
        trade({
          id: 'option-ex',
          strategyId: 'cat-options',
          symbol: 'CAT   260618C00900000',
          assetClass: 'OPT',
          side: 'SELL',
          quantity: -5,
          price: 0,
          rawRow: { 'Notes/Codes': 'C;Ex' },
        }),
      ]
    );

    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.match.strategyId).toBe('cat-options');
      expect(result.match.optionTradeIds).toEqual(['option-ex']);
      expect(result.match.kind).toBe('exercise');
      expect(result.match.strike).toBe(900);
    }
  });

  it('matches assigned short calls to the option strategy', () => {
    const result = matchStockExerciseAssignmentToOptionStrategy(
      trade({
        id: 'stock-a',
        side: 'SELL',
        quantity: -500,
        price: 950,
        rawRow: { 'Notes/Codes': 'A' },
      }),
      [
        trade({
          id: 'option-a',
          strategyId: 'cat-options',
          symbol: 'CAT   260618C00950000',
          assetClass: 'OPT',
          side: 'BUY',
          quantity: 5,
          price: 0,
          rawRow: { 'Notes/Codes': 'A;C' },
        }),
      ]
    );

    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.match.strategyId).toBe('cat-options');
      expect(result.match.kind).toBe('assignment');
      expect(result.match.right).toBe('C');
      expect(result.match.strike).toBe(950);
    }
  });

  it('aggregates split option close rows before matching stock quantity', () => {
    const result = matchStockExerciseAssignmentToOptionStrategy(
      trade({
        id: 'stock-ex',
        side: 'BUY',
        quantity: 500,
        price: 900,
        rawRow: { 'Notes/Codes': 'Ex' },
      }),
      [
        trade({
          id: 'option-ex-1',
          strategyId: 'cat-options',
          symbol: 'CAT   260618C00900000',
          assetClass: 'OPT',
          side: 'SELL',
          quantity: -3,
          price: 0,
          rawRow: { 'Notes/Codes': 'C;Ex' },
        }),
        trade({
          id: 'option-ex-2',
          strategyId: 'cat-options',
          symbol: 'CAT   260618C00900000',
          assetClass: 'OPT',
          side: 'SELL',
          quantity: -2,
          price: 0,
          rawRow: { 'Notes/Codes': 'C;Ex' },
        }),
      ]
    );

    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.match.optionContracts).toBe(5);
      expect(result.match.optionTradeIds).toEqual(['option-ex-1', 'option-ex-2']);
    }
  });

  it('does not match ordinary expiry rows', () => {
    const result = matchStockExerciseAssignmentToOptionStrategy(
      trade({
        id: 'stock-ex',
        side: 'BUY',
        quantity: 500,
        price: 860,
        rawRow: { 'Notes/Codes': 'Ex' },
      }),
      [
        trade({
          id: 'option-expired',
          strategyId: 'cat-options',
          symbol: 'CAT   260618P00860000',
          assetClass: 'OPT',
          side: 'BUY',
          quantity: 5,
          price: 0,
          rawRow: { 'Notes/Codes': 'C;Ep' },
        }),
      ]
    );

    expect(result.status).toBe('none');
  });
});
