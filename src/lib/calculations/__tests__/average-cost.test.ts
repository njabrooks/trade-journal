/**
 * Golden tests for the pure average-cost cores:
 *   computeAcquisitionPure(position, event)
 *   computeDisposalPure(position, event)
 *
 * All expectations are HAND-COMPUTED (arithmetic shown in comments),
 * not pasted from implementation output.
 *
 * NOTE: importing average-cost.ts pulls in "@/db", whose module body
 * eagerly constructs a postgres client and THROWS if DATABASE_URL_POOLER
 * is unset (vitest.config.ts deliberately blanks it). We therefore mock
 * "@/db" — the pure functions never touch it.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  computeAcquisitionPure,
  computeDisposalPure,
  type EventForAverageCost,
} from "@/lib/calculations/average-cost";
import type { AverageCostState } from "@/lib/calculations/types";

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

function makePosition(overrides: Partial<AverageCostState> = {}): AverageCostState {
  return {
    positionId: "pos-1",
    totalQuantity: 0,
    totalCostBasis: 0,
    averageCostPerUnit: 0,
    firstAcquisitionDate: undefined,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<EventForAverageCost> = {}): EventForAverageCost {
  return {
    id: "evt-1",
    userId: "user-1",
    assetId: "asset-1",
    owner: "owner-1",
    account: "acct-1",
    eventType: "BUY",
    timestamp: new Date("2024-01-01T00:00:00Z"),
    quantity: "1",
    totalValue: "100",
    assetTicker: "BTC",
    costBasis: null,
    source: null,
    metadata: null,
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// a. Two acquisitions → weighted average cost
// ----------------------------------------------------------------------------

describe("computeAcquisitionPure — weighted average", () => {
  it("buy 1 @ $100 with $10 commission: cost basis includes commission", () => {
    // eventCost = totalValue + metadata.commission = 100 + 10 = 110
    // (the code derives cost from totalValue + commission; event.costBasis is
    //  intentionally ignored because FIFO may have overwritten it)
    const pos = makePosition();
    const { newPosition, eventCalcData } = computeAcquisitionPure(
      pos,
      makeEvent({ quantity: "1", totalValue: "100", metadata: { commission: 10 } })
    );

    // newQty = 0 + 1 = 1; newCost = 0 + 110 = 110; avg = 110 / 1 = 110
    expect(newPosition.totalQuantity).toBe(1);
    expect(newPosition.totalCostBasis).toBe(110);
    expect(newPosition.averageCostPerUnit).toBe(110);
    expect(eventCalcData.costBasis).toBe("110.00");
    expect(eventCalcData.newAverageCost).toBe("110.00000000");
    // Plain long acquisition: no realized gain key at all
    expect("realizedGain" in eventCalcData).toBe(false);
    // First acquisition sets firstAcquisitionDate to event timestamp
    expect(newPosition.firstAcquisitionDate).toEqual(new Date("2024-01-01T00:00:00Z"));
  });

  it("second buy 1 @ $200 (no commission) → weighted average $155", () => {
    // Position after first buy: qty 1, cost 110, avg 110
    const pos = makePosition({
      totalQuantity: 1,
      totalCostBasis: 110,
      averageCostPerUnit: 110,
      firstAcquisitionDate: new Date("2024-01-01T00:00:00Z"),
    });
    const { newPosition, eventCalcData } = computeAcquisitionPure(
      pos,
      makeEvent({
        id: "evt-2",
        quantity: "1",
        totalValue: "200",
        timestamp: new Date("2024-01-05T00:00:00Z"),
      })
    );

    // newQty = 1 + 1 = 2
    // newCost = 110 + 200 = 310
    // avg = 310 / 2 = 155
    expect(newPosition.totalQuantity).toBe(2);
    expect(newPosition.totalCostBasis).toBe(310);
    expect(newPosition.averageCostPerUnit).toBe(155);
    expect(eventCalcData.costBasis).toBe("200.00");
    expect(eventCalcData.newAverageCost).toBe("155.00000000");
    // firstAcquisitionDate is preserved, not advanced
    expect(newPosition.firstAcquisitionDate).toEqual(new Date("2024-01-01T00:00:00Z"));
  });
});

// ----------------------------------------------------------------------------
// b. Disposal from long position
// ----------------------------------------------------------------------------

describe("computeDisposalPure — disposal from long", () => {
  it("sell 1 of 2 @ $250 with $5 commission: gain = net proceeds − avgCost×qty", () => {
    // Position: qty 2, cost 310, avg 155, first acquired 2024-01-01
    const pos = makePosition({
      totalQuantity: 2,
      totalCostBasis: 310,
      averageCostPerUnit: 155,
      firstAcquisitionDate: new Date("2024-01-01T00:00:00Z"),
    });
    const { newPosition, eventCalcData } = computeDisposalPure(
      pos,
      makeEvent({
        eventType: "SELL",
        quantity: "1",
        totalValue: "250",
        metadata: { commission: 5 },
        timestamp: new Date("2024-03-01T00:00:00Z"),
      })
    );

    // proceeds  = 250 − 5 = 245   (commission reduces proceeds)
    // costBasis = 1 × 155 = 155
    // gain      = 245 − 155 = 90
    expect(eventCalcData.costBasis).toBe("155.00");
    expect(eventCalcData.realizedGain).toBe("90.00");
    expect(eventCalcData.averageCostUsed).toBe("155.00000000");

    // Remaining: qty = 2 − 1 = 1; cost = 1 × 155 = 155; avg unchanged
    expect(newPosition.totalQuantity).toBe(1);
    expect(newPosition.totalCostBasis).toBe(155);
    expect(newPosition.averageCostPerUnit).toBe(155);

    // holdingDays = days(2024-01-01 → 2024-03-01) = 31 (Jan) + 29 (Feb, leap) = 60
    expect(eventCalcData.holdingDays).toBe(60);
    expect(eventCalcData.isLongTerm).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// c. Short cover (BUY against a negative position)
// ----------------------------------------------------------------------------

describe("computeAcquisitionPure — short covers", () => {
  it("partial cover: short 10 @ avg $50, buy 4 @ $40/unit → gain $40", () => {
    // Short position: qty −10, avg 50 (sold at $50), cost −10×50 = −500
    const pos = makePosition({
      totalQuantity: -10,
      totalCostBasis: -500,
      averageCostPerUnit: 50,
    });
    const { newPosition, eventCalcData } = computeAcquisitionPure(
      pos,
      makeEvent({ quantity: "4", totalValue: "160" }) // 4 units @ $40
    );

    // eventCost      = 160
    // coverQty       = min(4, 10) = 4; remainingBuyQty = 0
    // coverCost      = 160 × (4/4) = 160
    // shortCostBasis = 50 × 4 = 200   (what we originally sold the 4 for)
    // shortCoverGain = 200 − 160 = 40 (bought back cheaper → profit)
    expect(eventCalcData.realizedGain).toBe("40.00");
    expect(eventCalcData.costBasis).toBe("160.00");

    // Partial cover keeps short avg: newQty = −10 + 4 = −6
    // newCost = −6 × 50 = −300; avg stays 50
    expect(newPosition.totalQuantity).toBe(-6);
    expect(newPosition.totalCostBasis).toBe(-300);
    expect(newPosition.averageCostPerUnit).toBe(50);
  });

  it("cover short AND open long: short 4 @ avg $50, buy 10 @ $60/unit", () => {
    // Short: qty −4, avg 50, cost −200
    const pos = makePosition({
      totalQuantity: -4,
      totalCostBasis: -200,
      averageCostPerUnit: 50,
    });
    const { newPosition, eventCalcData } = computeAcquisitionPure(
      pos,
      makeEvent({ quantity: "10", totalValue: "600" }) // 10 units @ $60
    );

    // eventCost      = 600
    // coverQty       = min(10, 4) = 4; remainingBuyQty = 6
    // coverCost      = 600 × (4/10) = 240
    // shortCostBasis = 50 × 4 = 200
    // shortCoverGain = 200 − 240 = −40 (covered at higher price → loss)
    expect(eventCalcData.realizedGain).toBe("-40.00");

    // Long opens with remaining portion: remainingCost = 600 × (6/10) = 360
    // newQty = 6; newCost = 360; avg = 360 / 6 = 60
    expect(newPosition.totalQuantity).toBe(6);
    expect(newPosition.totalCostBasis).toBe(360);
    expect(newPosition.averageCostPerUnit).toBe(60);
  });
});

// ----------------------------------------------------------------------------
// d. Extending a short → weighted average of short basis
// ----------------------------------------------------------------------------

describe("computeDisposalPure — extending a short", () => {
  it("short 10 @ avg $50, sell 5 more @ $60/unit → weighted short avg $53.33...", () => {
    // Short: qty −10, avg 50, cost −500
    const pos = makePosition({
      totalQuantity: -10,
      totalCostBasis: -500,
      averageCostPerUnit: 50,
    });
    const { newPosition, eventCalcData } = computeDisposalPure(
      pos,
      makeEvent({ eventType: "SELL", quantity: "5", totalValue: "300" }) // 5 @ $60
    );

    // longCloseQty = max(0, −10) = 0 → no long leg closed
    // shortOpenQty = 5 − 0 = 5
    // shortProceeds = 300 × (5/5) = 300
    // costBasis (for the long leg) = 0; realizedGain = 0 − 0 = 0
    expect(eventCalcData.costBasis).toBe("0.00");
    expect(eventCalcData.realizedGain).toBe("0.00");
    expect(eventCalcData.averageCostUsed).toBe("50.00000000"); // pre-event avg

    // Weighted short avg:
    //   existing short cost = |−500| = 500, qty 10
    //   total = (500 + 300) / (10 + 5) = 800 / 15 = 53.3333...
    expect(newPosition.averageCostPerUnit).toBeCloseTo(800 / 15, 10);
    // newQty = −10 − 5 = −15; newCost = −15 × (800/15) = −800
    expect(newPosition.totalQuantity).toBe(-15);
    expect(newPosition.totalCostBasis).toBeCloseTo(-800, 8);
  });
});

// ----------------------------------------------------------------------------
// e. Long-term flag (> 365 days)
// ----------------------------------------------------------------------------

describe("computeDisposalPure — long-term holding flag", () => {
  it("517-day hold → isLongTerm true", () => {
    // 2023-01-01 → 2024-06-01:
    //   2023-01-01 → 2024-01-01 = 365 days (2023 not a leap year)
    //   2024-01-01 → 2024-06-01 = 31+29+31+30+31 = 152 days
    //   total = 517 > 365
    const pos = makePosition({
      totalQuantity: 1,
      totalCostBasis: 100,
      averageCostPerUnit: 100,
      firstAcquisitionDate: new Date("2023-01-01T00:00:00Z"),
    });
    const { eventCalcData } = computeDisposalPure(
      pos,
      makeEvent({
        eventType: "SELL",
        quantity: "1",
        totalValue: "150",
        timestamp: new Date("2024-06-01T00:00:00Z"),
      })
    );
    expect(eventCalcData.holdingDays).toBe(517);
    expect(eventCalcData.isLongTerm).toBe(true);
    // gain = 150 − 100 = 50
    expect(eventCalcData.realizedGain).toBe("50.00");
  });

  it("exactly 365 days is NOT long-term (strict >)", () => {
    const pos = makePosition({
      totalQuantity: 1,
      totalCostBasis: 100,
      averageCostPerUnit: 100,
      firstAcquisitionDate: new Date("2023-01-01T00:00:00Z"),
    });
    const { eventCalcData } = computeDisposalPure(
      pos,
      makeEvent({
        eventType: "SELL",
        quantity: "1",
        totalValue: "150",
        timestamp: new Date("2024-01-01T00:00:00Z"), // exactly 365 days later
      })
    );
    expect(eventCalcData.holdingDays).toBe(365);
    expect(eventCalcData.isLongTerm).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// f. Special event branches
// ----------------------------------------------------------------------------

describe("special event branches", () => {
  it("futures trade acquisition (ibkrAssetClass=FUT, non-SOF) has zero cost and explicit $0 gain", () => {
    const pos = makePosition();
    const { newPosition, eventCalcData } = computeAcquisitionPure(
      pos,
      makeEvent({
        quantity: "2",
        totalValue: "10000",
        source: "ibkr_trade",
        metadata: { ibkrAssetClass: "FUT" },
      })
    );
    // eventCost forced to 0 → qty 2, cost 0, avg 0
    expect(newPosition.totalQuantity).toBe(2);
    expect(newPosition.totalCostBasis).toBe(0);
    expect(newPosition.averageCostPerUnit).toBe(0);
    expect(eventCalcData.costBasis).toBe("0.00");
    // FIFO-leak fix: realizedGain explicitly "0.00" (must overwrite stale jsonb)
    expect(eventCalcData.realizedGain).toBe("0.00");
  });

  it("futures trade disposal has zero proceeds and zero gain", () => {
    // Long 2 futures @ avg 0
    const pos = makePosition({ totalQuantity: 2, totalCostBasis: 0, averageCostPerUnit: 0 });
    const { newPosition, eventCalcData } = computeDisposalPure(
      pos,
      makeEvent({
        eventType: "SELL",
        quantity: "2",
        totalValue: "11000",
        source: "ibkr_trade",
        metadata: { ibkrAssetClass: "FUT" },
      })
    );
    // proceeds forced 0; costBasis = 2 × 0 = 0; gain = 0 − 0 = 0
    expect(eventCalcData.costBasis).toBe("0.00");
    expect(eventCalcData.realizedGain).toBe("0.00");
    expect(newPosition.totalQuantity).toBe(0);
  });

  it("Koinly transfer RECEIVE carries average cost forward (cost-neutral)", () => {
    // Long 2 @ avg 100 (cost 200). Transfer in 3 units with CSV totalValue=$0.
    const pos = makePosition({ totalQuantity: 2, totalCostBasis: 200, averageCostPerUnit: 100 });
    const { newPosition, eventCalcData } = computeAcquisitionPure(
      pos,
      makeEvent({
        eventType: "RECEIVE",
        quantity: "3",
        totalValue: "0",
        metadata: { koinlyType: "transfer" },
      })
    );
    // eventCost = avgCost × qty = 100 × 3 = 300 (NOT the $0 from the CSV)
    // newQty = 5; newCost = 200 + 300 = 500; avg = 500/5 = 100 (preserved)
    expect(eventCalcData.costBasis).toBe("300.00");
    expect(newPosition.totalQuantity).toBe(5);
    expect(newPosition.totalCostBasis).toBe(500);
    expect(newPosition.averageCostPerUnit).toBe(100);
    expect("realizedGain" in eventCalcData).toBe(false);
  });

  it("Koinly transfer SEND is cost-neutral: realizedGain = 0, proportional cost out", () => {
    const pos = makePosition({ totalQuantity: 5, totalCostBasis: 500, averageCostPerUnit: 100 });
    const { newPosition, eventCalcData } = computeDisposalPure(
      pos,
      makeEvent({
        eventType: "SEND",
        quantity: "2",
        totalValue: "0",
        metadata: { koinlyType: "transfer" },
      })
    );
    // costBasis = 2 × 100 = 200; gain forced to 0 (no phantom loss from $0 value)
    expect(eventCalcData.costBasis).toBe("200.00");
    // NOTE: actual behavior — this branch writes the literal string "0", not "0.00"
    expect(eventCalcData.realizedGain).toBe("0");
    // newQty = 3; newCost = 3 × 100 = 300
    expect(newPosition.totalQuantity).toBe(3);
    expect(newPosition.totalCostBasis).toBe(300);
    expect(newPosition.averageCostPerUnit).toBe(100);
  });

  it("Koinly 'Realized gain' RECEIVE: entire totalValue is the gain", () => {
    // USD settlement from a derivative win: receive 500 USD, totalValue 500
    const pos = makePosition();
    const { newPosition, eventCalcData } = computeAcquisitionPure(
      pos,
      makeEvent({
        eventType: "RECEIVE",
        quantity: "500",
        totalValue: "500",
        metadata: { tag: "Realized gain" },
      })
    );
    // realizedGain = rawTotalValue = 500
    expect(eventCalcData.realizedGain).toBe("500.00");
    // Position still accumulates normally: qty 500, cost 500, avg 1
    expect(newPosition.totalQuantity).toBe(500);
    expect(newPosition.totalCostBasis).toBe(500);
    expect(newPosition.averageCostPerUnit).toBe(1);
  });

  it("Koinly 'Realized gain' SEND: gain = −costBasis (V1 Path 2B), proceeds ignored", () => {
    // USD position: qty 1000, cost 900, avg 0.9. SEND 300 with totalValue 300.
    const pos = makePosition({ totalQuantity: 1000, totalCostBasis: 900, averageCostPerUnit: 0.9 });
    const { newPosition, eventCalcData } = computeDisposalPure(
      pos,
      makeEvent({
        eventType: "SEND",
        quantity: "300",
        totalValue: "300",
        metadata: { tag: "Realized gain" },
      })
    );
    // costBasis = 300 × 0.9 = 270
    // NOTE: actual behavior — realizedGain = −costBasis = −270,
    //   NOT proceeds − cost (= +30) and NOT −totalValue (= −300).
    //   Matches V1 Path 2B which ignores proceeds for "Realized gain" disposals.
    expect(eventCalcData.costBasis).toBe("270.00");
    expect(eventCalcData.realizedGain).toBe("-270.00");
    // newQty = 700; newCost = 700 × 0.9 = 630
    expect(newPosition.totalQuantity).toBe(700);
    expect(newPosition.totalCostBasis).toBeCloseTo(630, 8);
    expect(eventCalcData.holdingDays).toBe(0);
    expect(eventCalcData.isLongTerm).toBe(false);
  });

  it("ADJ acquisition from flat: gain = max(|eventCost|, |totalValue|) — equal case picks totalValue", () => {
    // ADJ RECEIVE 42 USD, totalValue 42, no commission → eventCost = 42
    // accumulatedCostBasis = 42; |42| > |42| is false → realizedGain = totalValue = 42
    const pos = makePosition();
    const { newPosition, eventCalcData } = computeAcquisitionPure(
      pos,
      makeEvent({
        eventType: "RECEIVE",
        quantity: "42",
        totalValue: "42",
        source: "ibkr_sof",
        metadata: { activityCode: "ADJ" },
      })
    );
    expect(eventCalcData.realizedGain).toBe("42.00");
    expect(newPosition.totalQuantity).toBe(42);
    expect(newPosition.totalCostBasis).toBe(42);
  });

  it("ADJ acquisition where commission pushes eventCost above totalValue picks eventCost", () => {
    // totalValue 42 + commission 5 → eventCost = 47; |47| > |42| → realizedGain = 47
    const pos = makePosition();
    const { eventCalcData } = computeAcquisitionPure(
      pos,
      makeEvent({
        eventType: "RECEIVE",
        quantity: "42",
        totalValue: "42",
        source: "ibkr_sof",
        metadata: { activityCode: "ADJ", commission: 5 },
      })
    );
    expect(eventCalcData.realizedGain).toBe("47.00");
  });

  it("ADJ disposal from long: gain = −(avgCost × qty), ignoring proceeds", () => {
    // Long 10 @ avg 2 (cost 20). ADJ SELL 4 with totalValue 100.
    const pos = makePosition({ totalQuantity: 10, totalCostBasis: 20, averageCostPerUnit: 2 });
    const { newPosition, eventCalcData } = computeDisposalPure(
      pos,
      makeEvent({
        eventType: "SELL",
        quantity: "4",
        totalValue: "100",
        source: "ibkr_sof",
        metadata: { activityCode: "ADJ" },
      })
    );
    // costBasis = 4 × 2 = 8; ADJ branch: realizedGain = −costBasis = −8 (NOT 100 − 8)
    expect(eventCalcData.costBasis).toBe("8.00");
    expect(eventCalcData.realizedGain).toBe("-8.00");
    // newQty = 6; newCost = 6 × 2 = 12
    expect(newPosition.totalQuantity).toBe(6);
    expect(newPosition.totalCostBasis).toBe(12);
  });

  it("FUT ADJ from SOF is NOT treated as a futures trade (cost is real)", () => {
    // source='ibkr_sof' with ibkrAssetClass='FUT' → isFuturesTradeEvent = false,
    // so eventCost = totalValue (not forced to 0). ADJ formula still applies.
    const pos = makePosition();
    const { newPosition, eventCalcData } = computeAcquisitionPure(
      pos,
      makeEvent({
        eventType: "RECEIVE",
        quantity: "10",
        totalValue: "10",
        source: "ibkr_sof",
        metadata: { activityCode: "ADJ", ibkrAssetClass: "FUT" },
      })
    );
    expect(eventCalcData.costBasis).toBe("10.00"); // not zeroed
    expect(eventCalcData.realizedGain).toBe("10.00");
    expect(newPosition.totalCostBasis).toBe(10);
  });
});

// ----------------------------------------------------------------------------
// g. Sell more than held (long → short flip) — documenting actual behavior
// ----------------------------------------------------------------------------

describe("computeDisposalPure — long → short flip", () => {
  it("long 3 @ avg $100, sell 5 @ $120/unit: gain only on the long leg, short opens at sale price", () => {
    const pos = makePosition({
      totalQuantity: 3,
      totalCostBasis: 300,
      averageCostPerUnit: 100,
      firstAcquisitionDate: new Date("2024-01-01T00:00:00Z"),
    });
    const { newPosition, eventCalcData } = computeDisposalPure(
      pos,
      makeEvent({
        eventType: "SELL",
        quantity: "5",
        totalValue: "600", // 5 units @ $120
        timestamp: new Date("2024-02-01T00:00:00Z"),
      })
    );

    // longCloseQty = 3; shortOpenQty = 5 − 3 = 2
    // longCostBasis = 3 × 100 = 300
    // longProceeds  = 600 × (3/5) = 360
    // realizedGain  = 360 − 300 = 60   (gain only on the closed long leg)
    // shortProceeds = 600 × (2/5) = 240 → shortCostPerUnit = 240 / 2 = 120
    expect(eventCalcData.costBasis).toBe("300.00");
    expect(eventCalcData.realizedGain).toBe("60.00");
    expect(eventCalcData.averageCostUsed).toBe("100.00000000"); // pre-flip avg

    // NOTE: actual behavior — after the flip the position's averageCostPerUnit
    // becomes the SHORT-sale price (120), and totalCostBasis goes negative:
    //   newQty = 3 − 5 = −2; newCost = −2 × 120 = −240
    expect(newPosition.totalQuantity).toBe(-2);
    expect(newPosition.averageCostPerUnit).toBe(120);
    expect(newPosition.totalCostBasis).toBe(-240);

    // NOTE: actual behavior — firstAcquisitionDate of the old long survives
    // the flip (it is carried forward unchanged on disposals).
    expect(newPosition.firstAcquisitionDate).toEqual(new Date("2024-01-01T00:00:00Z"));
    // holdingDays = days(2024-01-01 → 2024-02-01) = 31
    expect(eventCalcData.holdingDays).toBe(31);
  });
});
