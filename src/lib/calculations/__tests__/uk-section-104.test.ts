/**
 * Golden tests for the pure UK Section 104 matching core (processScope)
 * plus the date helpers (formatDate / addDays).
 *
 * All expectations are HAND-COMPUTED — the arithmetic is shown in comments
 * next to each assertion, derived from the HMRC matching order:
 *   1. same-day acquisitions (FIFO within the day, per implementation)
 *   2. acquisitions in the following 30 calendar days (bed & breakfast)
 *   3. Section 104 pool at running average cost
 *
 * These tests are pure: processScope never touches the database. However
 * uk-section-104.ts imports "@/db" at module level, and src/db/index.ts
 * THROWS at import time when DATABASE_URL_POOLER is blank (vitest.config.ts
 * deliberately blanks it). So we mock "@/db" purely as an import-time shim —
 * nothing in these tests ever calls it.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  processScope,
  formatDate,
  addDays,
  isSpecialEvent,
  parseEventMetadata,
  type S104Event,
  type EventMetadata,
} from "../uk-section-104";

// ============================================================================
// Test event builder
// ============================================================================

let idCounter = 0;

function makeEvent(opts: {
  id?: string;
  type: "BUY" | "SELL" | "FEE";
  ts: string; // ISO timestamp
  qty: number;
  gbp: number; // totalValueGbp (already absolute, as parseEvents would produce)
  meta?: EventMetadata;
  gbpCostBasis?: number | null;
  gbpRealizedGain?: number | null;
}): S104Event {
  const timestamp = new Date(opts.ts);
  const meta = opts.meta ?? {};
  return {
    id: opts.id ?? `ev-${++idCounter}`,
    userId: "user-1",
    assetId: "asset-btc",
    owner: "Nick",
    account: "acct-1",
    eventType: opts.type,
    timestamp,
    dateStr: formatDate(timestamp),
    quantity: opts.qty,
    totalValueGbp: opts.gbp,
    fxRateToGbp: 0.8,
    isAcq: opts.type === "BUY",
    isDisp: opts.type === "SELL" || opts.type === "FEE",
    // Derive via the real classifier so FEE / "Realized gain" tests exercise it
    isSpecial: isSpecialEvent(opts.type, meta, null),
    meta,
    costPerUnitGbp: opts.qty > 0 ? opts.gbp / opts.qty : 0,
    gbpCostBasis: opts.gbpCostBasis ?? null,
    gbpRealizedGain: opts.gbpRealizedGain ?? null,
  };
}

// ============================================================================
// (a) Simple pool
// ============================================================================

describe("processScope — simple Section 104 pool", () => {
  it("averages two buys and realizes gain against pool average", () => {
    // Buy 1 BTC @ £10,000   → pool: qty 1, cost £10,000, avg £10,000
    // Buy 1 BTC @ £20,000   → pool: qty 2, cost £30,000, avg £15,000
    // Sell 1 BTC @ £25,000  → pool match 1 @ avg £15,000
    //   cost basis = 1 × 15,000 = £15,000
    //   proceeds   = £25,000
    //   gain       = 25,000 − 15,000 = £10,000
    //   pool after = qty 1, cost 30,000 − 15,000 = £15,000, avg £15,000
    const a1 = makeEvent({ type: "BUY", ts: "2024-01-01T10:00:00Z", qty: 1, gbp: 10000 });
    const a2 = makeEvent({ type: "BUY", ts: "2024-02-01T10:00:00Z", qty: 1, gbp: 20000 });
    const d1 = makeEvent({ type: "SELL", ts: "2024-03-01T10:00:00Z", qty: 1, gbp: 25000 });

    const result = processScope([a1, a2, d1]);

    expect(result.matches).toHaveLength(1);
    const m = result.matches[0];
    expect(m.matchType).toBe("section_104_pool");
    expect(m.disposalEventId).toBe(d1.id);
    expect(m.acquisitionEventId).toBeNull();
    expect(m.quantityMatched).toBe(1);
    expect(m.costBasisGbp).toBe(15000);
    expect(m.proceedsGbp).toBe(25000);
    expect(m.realizedGainGbp).toBe(10000);
    expect(m.poolQtyAfter).toBe(1);
    expect(m.poolCostGbpAfter).toBe(15000);

    // Final pool: 1 BTC remaining at avg £15,000
    expect(result.finalPool.poolQuantity).toBe(1);
    expect(result.finalPool.poolCostBasisGbp).toBe(15000);
    expect(result.finalPool.poolAverageCostGbp).toBe(15000);

    // Calc updates: one per event; disposal carries S104 totals
    expect(result.calcUpdates).toHaveLength(3);
    const dispUpdate = result.calcUpdates.find((u) => u.eventId === d1.id)!;
    expect(dispUpdate.s104CostBasisGbp).toBe("15000.00");
    expect(dispUpdate.s104RealizedGainGbp).toBe("10000.00");
    expect(dispUpdate.newAverageCostGbp).toBe("15000.00000000");

    // Acquisition updates record the running pool average at that point
    const a1Update = result.calcUpdates.find((u) => u.eventId === a1.id)!;
    expect(a1Update.newAverageCostGbp).toBe("10000.00000000");
    const a2Update = result.calcUpdates.find((u) => u.eventId === a2.id)!;
    expect(a2Update.newAverageCostGbp).toBe("15000.00000000");

    expect(result.lastEventId).toBe(d1.id);
  });
});

// ============================================================================
// (b) Same-day rule
// ============================================================================

describe("processScope — same-day rule", () => {
  it("matches same-day acquisitions FIFO before touching the pool", () => {
    // Pool seed:    buy 1 BTC @ £5,000 on 2024-01-01
    // Same day:     buy 2 BTC @ £20,000 (£10,000/u) at 09:00
    //               sell 2 BTC @ £30,000 (£15,000/u) at 12:00
    //               buy 1 BTC @ £12,000 at 14:00
    //
    // Same-day matching (FIFO over the day's acquisitions):
    //   first acq has 2 available → match all 2 against it
    //   cost     = 2 × 10,000 = £20,000
    //   proceeds = £30,000
    //   gain     = £10,000
    //   nothing left for B&B or pool (poolRemaining = 0)
    //
    // Pool evolution (Pass 2):
    //   seed buy        → qty 1, cost £5,000, avg £5,000
    //   09:00 buy       → fully reserved by same-day match, no pool add
    //   sell            → poolRemaining 0, pool untouched
    //   14:00 buy       → unreserved, adds 1 @ £12,000
    //   final pool      → qty 2, cost £17,000, avg £8,500
    //
    // NOTE: diverges from statutory rule? TCGA92 s105(1)(a) treats ALL
    // same-day acquisitions as a single aggregated lot (3 BTC @ £32,000,
    // avg £10,666.67 → cost for 2 = £21,333.33, gain £8,666.67). The
    // implementation instead matches FIFO acquisition-by-acquisition,
    // giving cost £20,000 / gain £10,000 here. Tested as actual behavior.
    const seed = makeEvent({ type: "BUY", ts: "2024-01-01T10:00:00Z", qty: 1, gbp: 5000 });
    const b1 = makeEvent({ type: "BUY", ts: "2024-05-10T09:00:00Z", qty: 2, gbp: 20000 });
    const s1 = makeEvent({ type: "SELL", ts: "2024-05-10T12:00:00Z", qty: 2, gbp: 30000 });
    const b2 = makeEvent({ type: "BUY", ts: "2024-05-10T14:00:00Z", qty: 1, gbp: 12000 });

    const result = processScope([seed, b1, s1, b2]);

    expect(result.matches).toHaveLength(1);
    const m = result.matches[0];
    expect(m.matchType).toBe("same_day");
    expect(m.acquisitionEventId).toBe(b1.id); // FIFO: first same-day acquisition
    expect(m.acquisitionDate).toBe("2024-05-10");
    expect(m.quantityMatched).toBe(2);
    expect(m.costBasisGbp).toBe(20000);
    expect(m.proceedsGbp).toBe(30000);
    expect(m.realizedGainGbp).toBe(10000);

    // Pool: seed (1 @ 5,000) + unreserved later buy (1 @ 12,000)
    expect(result.finalPool.poolQuantity).toBe(2);
    expect(result.finalPool.poolCostBasisGbp).toBe(17000);
    expect(result.finalPool.poolAverageCostGbp).toBe(8500);

    const dispUpdate = result.calcUpdates.find((u) => u.eventId === s1.id)!;
    expect(dispUpdate.s104CostBasisGbp).toBe("20000.00");
    expect(dispUpdate.s104RealizedGainGbp).toBe("10000.00");
  });

  it("matches same-day even when the acquisition occurs later in the day than the sale", () => {
    // Sell at 09:00, buy at 18:00 same calendar day — same-day rule is
    // date-based, so the disposal matches the later-in-day acquisition,
    // not the (empty) pool.
    // Sell 1 @ £8,000; buy 1 @ £7,000 → gain = 8,000 − 7,000 = £1,000
    const s = makeEvent({ type: "SELL", ts: "2024-04-02T09:00:00Z", qty: 1, gbp: 8000 });
    const b = makeEvent({ type: "BUY", ts: "2024-04-02T18:00:00Z", qty: 1, gbp: 7000 });

    const result = processScope([s, b]);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].matchType).toBe("same_day");
    expect(result.matches[0].acquisitionEventId).toBe(b.id);
    expect(result.matches[0].costBasisGbp).toBe(7000);
    expect(result.matches[0].realizedGainGbp).toBe(1000);
    // Acquisition fully reserved → pool stays empty
    expect(result.finalPool.poolQuantity).toBe(0);
  });
});

// ============================================================================
// (c) 30-day bed & breakfast rule
// ============================================================================

describe("processScope — 30-day bed & breakfast rule", () => {
  it("matches a re-buy on day 30 (boundary) against the disposal, not the pool", () => {
    // Buy 1 BTC @ £10,000 on 2024-01-01 (goes to pool)
    // Sell 1 BTC @ £15,000 on 2024-06-01
    // Re-buy 1 BTC @ £14,000 on 2024-07-01 — exactly 30 days later
    //   (2024-06-01 + 30 days = 2024-07-01, June has 30 days)
    //
    // B&B match (the LATER acquisition, not the earlier pool):
    //   cost     = £14,000
    //   proceeds = £15,000
    //   gain     = £1,000   (vs £5,000 if matched against the pool)
    // Pool untouched: still 1 @ £10,000. Re-buy fully reserved → no pool add.
    const a = makeEvent({ type: "BUY", ts: "2024-01-01T10:00:00Z", qty: 1, gbp: 10000 });
    const s = makeEvent({ type: "SELL", ts: "2024-06-01T10:00:00Z", qty: 1, gbp: 15000 });
    const r = makeEvent({ type: "BUY", ts: "2024-07-01T10:00:00Z", qty: 1, gbp: 14000 });

    const result = processScope([a, s, r]);

    expect(result.matches).toHaveLength(1);
    const m = result.matches[0];
    expect(m.matchType).toBe("bed_and_breakfast");
    expect(m.acquisitionEventId).toBe(r.id);
    expect(m.acquisitionDate).toBe("2024-07-01");
    expect(m.costBasisGbp).toBe(14000);
    expect(m.proceedsGbp).toBe(15000);
    expect(m.realizedGainGbp).toBe(1000);

    expect(result.finalPool.poolQuantity).toBe(1);
    expect(result.finalPool.poolCostBasisGbp).toBe(10000);
    expect(result.finalPool.poolAverageCostGbp).toBe(10000);
  });

  it("does NOT match a re-buy on day 31 — disposal falls through to the pool", () => {
    // Same as above but re-buy on 2024-07-02 (31 days after 2024-06-01).
    // B&B window is days 1..30 (up to 2024-07-01), so no B&B match.
    // Disposal matches the pool instead:
    //   cost = 1 × £10,000, proceeds £15,000 → gain £5,000; pool empties.
    // Re-buy is unreserved → starts a fresh pool: 1 @ £14,000.
    const a = makeEvent({ type: "BUY", ts: "2024-01-01T10:00:00Z", qty: 1, gbp: 10000 });
    const s = makeEvent({ type: "SELL", ts: "2024-06-01T10:00:00Z", qty: 1, gbp: 15000 });
    const r = makeEvent({ type: "BUY", ts: "2024-07-02T10:00:00Z", qty: 1, gbp: 14000 });

    const result = processScope([a, s, r]);

    expect(result.matches).toHaveLength(1);
    const m = result.matches[0];
    expect(m.matchType).toBe("section_104_pool");
    expect(m.costBasisGbp).toBe(10000);
    expect(m.realizedGainGbp).toBe(5000);
    expect(m.poolQtyAfter).toBe(0);
    expect(m.poolCostGbpAfter).toBe(0);

    // Fresh pool from the day-31 re-buy
    expect(result.finalPool.poolQuantity).toBe(1);
    expect(result.finalPool.poolCostBasisGbp).toBe(14000);
    expect(result.finalPool.poolAverageCostGbp).toBe(14000);
  });
});

// ============================================================================
// (d) Mixed disposal: same-day + B&B + pool in one sell
// ============================================================================

describe("processScope — mixed disposal consuming same-day, B&B, and pool", () => {
  it("splits one disposal across all three match types in priority order", () => {
    // 2024-01-01: buy 5 BTC @ £50,000 (£10,000/u)        → pool
    // 2024-03-10 10:00: sell 4 BTC @ £80,000 (£20,000/u)
    // 2024-03-10 11:00: buy 1 BTC @ £18,000               → same-day
    // 2024-03-20:       buy 1 BTC @ £19,000               → B&B (day 10)
    //
    // Match 1 (same_day, 1 BTC):
    //   cost 18,000, proceeds 20,000, gain 2,000
    // Match 2 (bed_and_breakfast, 1 BTC):
    //   cost 19,000, proceeds 20,000, gain 1,000
    // Match 3 (section_104_pool, remaining 2 BTC @ avg £10,000):
    //   cost 20,000, proceeds 40,000, gain 20,000
    //   pool after: qty 5−2 = 3, cost 50,000−20,000 = £30,000, avg £10,000
    //
    // Disposal totals: cost 18,000+19,000+20,000 = £57,000
    //                  gain  2,000+ 1,000+20,000 = £23,000
    const pool = makeEvent({ type: "BUY", ts: "2024-01-01T10:00:00Z", qty: 5, gbp: 50000 });
    const sell = makeEvent({ type: "SELL", ts: "2024-03-10T10:00:00Z", qty: 4, gbp: 80000 });
    const sameDay = makeEvent({ type: "BUY", ts: "2024-03-10T11:00:00Z", qty: 1, gbp: 18000 });
    const bnb = makeEvent({ type: "BUY", ts: "2024-03-20T10:00:00Z", qty: 1, gbp: 19000 });

    const result = processScope([pool, sell, sameDay, bnb]);

    expect(result.matches).toHaveLength(3);
    const [m1, m2, m3] = result.matches;

    expect(m1.matchType).toBe("same_day");
    expect(m1.acquisitionEventId).toBe(sameDay.id);
    expect(m1.quantityMatched).toBe(1);
    expect(m1.costBasisGbp).toBe(18000);
    expect(m1.proceedsGbp).toBe(20000);
    expect(m1.realizedGainGbp).toBe(2000);

    expect(m2.matchType).toBe("bed_and_breakfast");
    expect(m2.acquisitionEventId).toBe(bnb.id);
    expect(m2.acquisitionDate).toBe("2024-03-20");
    expect(m2.quantityMatched).toBe(1);
    expect(m2.costBasisGbp).toBe(19000);
    expect(m2.realizedGainGbp).toBe(1000);

    expect(m3.matchType).toBe("section_104_pool");
    expect(m3.quantityMatched).toBe(2);
    expect(m3.costBasisGbp).toBe(20000);
    expect(m3.proceedsGbp).toBe(40000);
    expect(m3.realizedGainGbp).toBe(20000);
    expect(m3.poolQtyAfter).toBe(3);
    expect(m3.poolCostGbpAfter).toBe(30000);

    const dispUpdate = result.calcUpdates.find((u) => u.eventId === sell.id)!;
    expect(dispUpdate.s104CostBasisGbp).toBe("57000.00");
    expect(dispUpdate.s104RealizedGainGbp).toBe("23000.00");
    expect(dispUpdate.newAverageCostGbp).toBe("10000.00000000");

    // Both reserved buys never reach the pool
    expect(result.finalPool.poolQuantity).toBe(3);
    expect(result.finalPool.poolCostBasisGbp).toBe(30000);
    expect(result.finalPool.poolAverageCostGbp).toBe(10000);
  });
});

// ============================================================================
// (e) Special events bypass matching
// ============================================================================

describe("processScope — special events (FEE, Koinly 'Realized gain')", () => {
  it("classifies special events via isSpecialEvent", () => {
    expect(isSpecialEvent("FEE", {}, null)).toBe(true);
    expect(isSpecialEvent("SELL", { tag: "Realized gain" }, null)).toBe(true);
    expect(isSpecialEvent("BUY", { koinlyType: "transfer" }, null)).toBe(true);
    expect(isSpecialEvent("BUY", { activityCode: "ADJ" }, null)).toBe(true);
    expect(isSpecialEvent("BUY", { ibkrAssetClass: "FUT" }, "ibkr")).toBe(true);
    // FUT from ibkr_sof is NOT special
    expect(isSpecialEvent("BUY", { ibkrAssetClass: "FUT" }, "ibkr_sof")).toBe(false);
    expect(isSpecialEvent("SELL", {}, null)).toBe(false);
    expect(isSpecialEvent("BUY", {}, null)).toBe(false);
  });

  it("parses metadata defensively", () => {
    expect(parseEventMetadata(null)).toEqual({});
    expect(parseEventMetadata("not-an-object")).toEqual({});
    // Wrong-typed fields are dropped
    const parsed = parseEventMetadata({ tag: 42, koinlyType: "transfer" });
    expect(parsed.tag).toBeUndefined();
    expect(parsed.koinlyType).toBe("transfer");
  });

  it("passes GBP values through without creating matches or touching the pool", () => {
    // Buy 1 BTC @ £10,000 → pool 1 @ £10,000
    // FEE 0.001 BTC (gbpRealizedGain −5)        → special passthrough
    // SELL 0.5 BTC tagged "Realized gain" (+1,000) → special passthrough
    //
    // Neither special event creates a match record or changes the pool;
    // their gbp_conversion values are carried into the S104 fields, and
    // newAverageCostGbp records the pool average at that point (£10,000).
    const a = makeEvent({ type: "BUY", ts: "2024-01-01T10:00:00Z", qty: 1, gbp: 10000 });
    const fee = makeEvent({
      type: "FEE",
      ts: "2024-02-01T10:00:00Z",
      qty: 0.001,
      gbp: 5,
      gbpCostBasis: 0,
      gbpRealizedGain: -5,
    });
    const rg = makeEvent({
      type: "SELL",
      ts: "2024-03-01T10:00:00Z",
      qty: 0.5,
      gbp: 1000,
      meta: { tag: "Realized gain" },
      gbpCostBasis: 0,
      gbpRealizedGain: 1000,
    });
    expect(fee.isSpecial).toBe(true);
    expect(rg.isSpecial).toBe(true);

    const result = processScope([a, fee, rg]);

    // No matching happened at all
    expect(result.matches).toHaveLength(0);

    // Pool unaffected by either special event
    expect(result.finalPool.poolQuantity).toBe(1);
    expect(result.finalPool.poolCostBasisGbp).toBe(10000);

    const feeUpdate = result.calcUpdates.find((u) => u.eventId === fee.id)!;
    expect(feeUpdate.s104CostBasisGbp).toBe("0.00");
    expect(feeUpdate.s104RealizedGainGbp).toBe("-5.00");
    expect(feeUpdate.newAverageCostGbp).toBe("10000.00000000");
    expect(feeUpdate.userId).toBe("user-1"); // backfilled from scope

    const rgUpdate = result.calcUpdates.find((u) => u.eventId === rg.id)!;
    expect(rgUpdate.s104CostBasisGbp).toBe("0.00");
    expect(rgUpdate.s104RealizedGainGbp).toBe("1000.00");
  });
});

// ============================================================================
// (f) Selling more than held — actual behavior
// ============================================================================

describe("processScope — overselling (disposal exceeds holdings)", () => {
  it("matches only what the pool holds and silently drops the shortfall", () => {
    // Buy 1 BTC @ £10,000; sell 2 BTC @ £30,000 (£15,000/u).
    // Pool match is capped at min(2, 1) = 1:
    //   cost 10,000, proceeds 1 × 15,000 = 15,000, gain 5,000
    //
    // NOTE: diverges from statutory rule? The unmatched 1 BTC (£15,000 of
    // proceeds) produces NO match record, NO error, and NO gain — the
    // disposal's S104 totals reflect only the matched portion (gain £5,000,
    // not £20,000 with zero basis). The shortfall is silently ignored.
    const a = makeEvent({ type: "BUY", ts: "2024-01-01T10:00:00Z", qty: 1, gbp: 10000 });
    const s = makeEvent({ type: "SELL", ts: "2024-02-01T10:00:00Z", qty: 2, gbp: 30000 });

    const result = processScope([a, s]);

    expect(result.matches).toHaveLength(1);
    const m = result.matches[0];
    expect(m.matchType).toBe("section_104_pool");
    expect(m.quantityMatched).toBe(1); // capped at pool quantity
    expect(m.costBasisGbp).toBe(10000);
    expect(m.proceedsGbp).toBe(15000); // only the matched unit's proceeds
    expect(m.realizedGainGbp).toBe(5000);
    expect(m.poolQtyAfter).toBe(0);

    const dispUpdate = result.calcUpdates.find((u) => u.eventId === s.id)!;
    expect(dispUpdate.s104CostBasisGbp).toBe("10000.00");
    expect(dispUpdate.s104RealizedGainGbp).toBe("5000.00"); // not 20000

    expect(result.finalPool.poolQuantity).toBe(0);
    expect(result.finalPool.poolCostBasisGbp).toBe(0);
  });

  it("records zero cost and zero gain when selling with no holdings at all", () => {
    // Sell 1 BTC @ £15,000 with an empty pool: no match record is created
    // and the disposal's S104 totals are 0/0 — the £15,000 proceeds vanish.
    const s = makeEvent({ type: "SELL", ts: "2024-02-01T10:00:00Z", qty: 1, gbp: 15000 });

    const result = processScope([s]);

    expect(result.matches).toHaveLength(0);
    const dispUpdate = result.calcUpdates.find((u) => u.eventId === s.id)!;
    expect(dispUpdate.s104CostBasisGbp).toBe("0.00");
    expect(dispUpdate.s104RealizedGainGbp).toBe("0.00");
  });
});

// ============================================================================
// (g) Date helpers
// ============================================================================

describe("date helpers", () => {
  it("formatDate returns the UTC calendar date", () => {
    expect(formatDate(new Date("2024-03-05T00:00:00Z"))).toBe("2024-03-05");
    expect(formatDate(new Date("2024-03-05T23:59:59.999Z"))).toBe("2024-03-05");
    // Offset timestamps resolve to the UTC date: 23:00−05:00 = 04:00Z next day
    expect(formatDate(new Date("2024-03-05T23:00:00-05:00"))).toBe("2024-03-06");
  });

  it("addDays handles month and year rollover", () => {
    expect(addDays("2024-01-31", 1)).toBe("2024-02-01"); // month rollover
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01"); // year rollover
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01"); // non-leap year
    expect(addDays("2024-03-15", 0)).toBe("2024-03-15"); // identity
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29"); // negative across month
    // The B&B boundary used in scenario (c): June has 30 days
    expect(addDays("2024-06-01", 30)).toBe("2024-07-01");
    expect(addDays("2024-06-01", 31)).toBe("2024-07-02");
  });
});
