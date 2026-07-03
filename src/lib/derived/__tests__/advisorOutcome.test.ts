import { describe, it, expect } from 'vitest';
import {
  entryNetPremiumPerShare,
  intrinsicAtSpotPerShare,
  scoreAdvisorOutcome,
  structureExpiry,
  summarizeAdvisorOutcomes,
  type AdvisorStructure,
  type AdvisorSummaryInputRow,
} from '../advisorOutcome';

const coveredCall = (strike: number, mid: number): AdvisorStructure => ({
  type: 'covered_call',
  legs: [{ action: 'sell', right: 'call', strike, expiry: '2026-08-21', mid }],
});

const protectivePut = (strike: number, mid: number): AdvisorStructure => ({
  type: 'protective_put',
  legs: [{ action: 'buy', right: 'put', strike, expiry: '2026-09-18', mid }],
});

const cashSecuredPut = (strike: number, mid: number): AdvisorStructure => ({
  type: 'cash_secured_put',
  legs: [{ action: 'sell', right: 'put', strike, expiry: '2026-08-21', mid }],
});

// long 90-strike put, short 75-strike put
const putSpread: AdvisorStructure = {
  type: 'put_spread',
  legs: [
    { action: 'buy', right: 'put', strike: 90, expiry: '2026-12-18', mid: 4.2 },
    { action: 'sell', right: 'put', strike: 75, expiry: '2026-12-18', mid: 1.1 },
  ],
};

describe('structureExpiry', () => {
  it('takes the latest leg expiry', () => {
    const s: AdvisorStructure = {
      type: 'diagonal',
      legs: [
        { action: 'buy', right: 'call', strike: 100, expiry: '2026-12-18', mid: 5 },
        { action: 'sell', right: 'call', strike: 120, expiry: '2026-08-21', mid: 2 },
      ],
    };
    expect(structureExpiry(s)).toBe('2026-12-18');
  });

  it('returns null for no legs', () => {
    expect(structureExpiry({ type: 'x', legs: [] })).toBeNull();
  });
});

describe('entryNetPremiumPerShare / intrinsicAtSpotPerShare', () => {
  it('sells collect, buys pay', () => {
    expect(entryNetPremiumPerShare(coveredCall(110, 2.5))).toBe(2.5);
    expect(entryNetPremiumPerShare(protectivePut(90, 3.2))).toBe(-3.2);
    expect(entryNetPremiumPerShare(putSpread)).toBe(-3.1); // -4.2 + 1.1
  });

  it('intrinsic is signed by position side', () => {
    // short 110 call with spot 120: −10 to the holder of the structure
    expect(intrinsicAtSpotPerShare(coveredCall(110, 2.5), 120)).toBe(-10);
    // long 90 put with spot 80: +10
    expect(intrinsicAtSpotPerShare(protectivePut(90, 3.2), 80)).toBe(10);
    // put spread capped below the short strike: 90−70 long minus 75−70 short = +15
    expect(intrinsicAtSpotPerShare(putSpread, 70)).toBe(15);
  });
});

describe('scoreAdvisorOutcome', () => {
  it('covered call expiring OTM keeps the full premium', () => {
    const score = scoreAdvisorOutcome(coveredCall(110, 2.5), 105, '2026-08-21', '2026-08-22T06:00:00Z');
    expect(score).not.toBeNull();
    expect(score!.entryNetPremiumPerShare).toBe(2.5);
    expect(score!.intrinsicAtExpiryPerShare).toBe(0);
    expect(score!.realizedPnlPerShare).toBe(2.5);
    expect(score!.win).toBe(true);
  });

  it('covered call blown through the strike loses net of premium', () => {
    const score = scoreAdvisorOutcome(coveredCall(110, 2.5), 120, '2026-08-21', '2026-08-22T06:00:00Z');
    expect(score!.realizedPnlPerShare).toBe(-7.5); // 2.5 − 10
    expect(score!.win).toBe(false);
  });

  it('protective put expiring worthless is the cost of insurance', () => {
    const score = scoreAdvisorOutcome(protectivePut(90, 3.2), 100, '2026-09-18', '2026-09-19T06:00:00Z');
    expect(score!.realizedPnlPerShare).toBe(-3.2);
    expect(score!.win).toBe(false);
  });

  it('protective put paying off beats its cost', () => {
    const score = scoreAdvisorOutcome(protectivePut(90, 3.2), 80, '2026-09-18', '2026-09-19T06:00:00Z');
    expect(score!.realizedPnlPerShare).toBe(6.8); // 10 − 3.2
    expect(score!.win).toBe(true);
  });

  it('cash-secured put assigned below breakeven is a loss', () => {
    const score = scoreAdvisorOutcome(cashSecuredPut(95, 2.0), 90, '2026-08-21', '2026-08-22T06:00:00Z');
    expect(score!.realizedPnlPerShare).toBe(-3.0); // 2 − 5
    expect(score!.win).toBe(false);
  });

  it('put spread settles net of both legs', () => {
    const score = scoreAdvisorOutcome(putSpread, 70, '2026-12-18', '2026-12-19T06:00:00Z');
    expect(score!.realizedPnlPerShare).toBe(11.9); // 15 − 3.1
    expect(score!.win).toBe(true);
    expect(score!.expiry).toBe('2026-12-18');
  });

  it('rejects a missing expiry or bad spot', () => {
    expect(scoreAdvisorOutcome({ type: 'x', legs: [] }, 100, '2026-08-21', 'now')).toBeNull();
    expect(scoreAdvisorOutcome(coveredCall(110, 2.5), 0, '2026-08-21', 'now')).toBeNull();
    expect(scoreAdvisorOutcome(coveredCall(110, 2.5), NaN, '2026-08-21', 'now')).toBeNull();
  });
});

describe('summarizeAdvisorOutcomes', () => {
  const asOf = new Date('2026-07-03T12:00:00Z');
  const row = (
    scenario: string,
    status: string,
    outcome: unknown = null,
    expiresAt: string | null = null
  ): AdvisorSummaryInputRow => ({ scenario, status, outcome, expiresAt });

  it('tallies statuses per scenario with hit rate over scored acted recs', () => {
    const summaries = summarizeAdvisorOutcomes(
      [
        row('income', 'acted', { realizedPnlPerShare: 2.5, win: true }),
        row('income', 'acted', { realizedPnlPerShare: -7.5, win: false }),
        row('income', 'acted'), // acted but not yet scored
        row('income', 'dismissed'),
        row('income', 'expired'),
        row('hedge', 'acted', { realizedPnlPerShare: -3.2, win: false }),
        row('hedge', 'superseded'),
      ],
      asOf
    );

    const income = summaries.find((s) => s.scenario === 'income')!;
    expect(income.acted).toBe(3);
    expect(income.scored).toBe(2);
    expect(income.wins).toBe(1);
    expect(income.hitRate).toBe(0.5);
    expect(income.dismissed).toBe(1);
    expect(income.expired).toBe(1);

    const hedge = summaries.find((s) => s.scenario === 'hedge')!;
    expect(hedge.acted).toBe(1);
    expect(hedge.hitRate).toBe(0);
    expect(hedge.superseded).toBe(1);
  });

  it('counts an active row past expires_at as expired without the maintenance pass', () => {
    const summaries = summarizeAdvisorOutcomes(
      [
        row('put_entry', 'active', null, '2026-06-20T00:00:00Z'), // lapsed
        row('put_entry', 'active', null, '2026-07-10T00:00:00Z'), // still live
        row('put_entry', 'active', null, null), // no expiry — live
      ],
      asOf
    );
    const s = summaries[0];
    expect(s.expired).toBe(1);
    expect(s.active).toBe(2);
    expect(s.hitRate).toBeNull();
  });
});
