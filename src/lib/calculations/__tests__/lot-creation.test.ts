/**
 * Golden tests for the pure lot-creation core:
 *   createLotDataFromEvent(event)
 *
 * All expectations are HAND-COMPUTED (arithmetic shown in comments).
 *
 * The function reconstructs the running quantity BEFORE the event from
 * the post-event runningQuantity:
 *   acquisition: before = after − quantity
 *   disposal:    before = after + quantity
 *
 * NOTE: importing lot-creation.ts pulls in "@/db", whose module body throws
 * when DATABASE_URL_POOLER is blank (as vitest.config.ts sets it), so we
 * mock "@/db". The pure function never uses it.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  createLotDataFromEvent,
  type LotCreationEvent,
} from "@/lib/calculations/lot-creation";

function makeEvent(overrides: Partial<LotCreationEvent> = {}): LotCreationEvent {
  return {
    id: "evt-1",
    userId: "user-1",
    assetId: "asset-1",
    owner: "owner-1",
    account: "acct-1",
    timestamp: new Date("2024-01-01T00:00:00Z"),
    eventType: "BUY",
    quantity: "10",
    totalValue: "1000",
    price: null,
    runningQuantity: "10",
    ...overrides,
  };
}

describe("createLotDataFromEvent — BUY", () => {
  it("a. BUY from flat → long lot with full quantity and cost", () => {
    // runningQty after = 10, before = 10 − 10 = 0 (flat) → all 10 is new long
    // costBasisPerUnit = 1000 / 10 = 100
    const lot = createLotDataFromEvent(
      makeEvent({ quantity: "10", totalValue: "1000", runningQuantity: "10" })
    );
    expect(lot).not.toBeNull();
    expect(lot!.lotType).toBe("long");
    expect(lot!.originalQuantity).toBe("10"); // toFixed(8) with trailing zeros trimmed
    expect(lot!.remainingQuantity).toBe("10");
    expect(lot!.consumedQuantity).toBe("0");
    expect(lot!.totalCostBasis).toBe("1000.00");
    expect(lot!.remainingCostBasis).toBe("1000.00");
    expect(lot!.costBasisPerUnit).toBe("100.00");
    expect(lot!.status).toBe("open");
    expect(lot!.acquisitionEventId).toBe("evt-1");
  });

  it("b. BUY that fully covers a short → null (no lot)", () => {
    // Short −5, buy 5: after = 0, before = 0 − 5 = −5
    // before < 0 → longPortion = max(0, after) = max(0, 0) = 0 → no lot
    expect(
      createLotDataFromEvent(
        makeEvent({ quantity: "5", totalValue: "500", runningQuantity: "0" })
      )
    ).toBeNull();

    // Short −5, buy 3 (partial cover): after = −2, before = −5
    // longPortion = max(0, −2) = 0 → no lot
    expect(
      createLotDataFromEvent(
        makeEvent({ quantity: "3", totalValue: "300", runningQuantity: "-2" })
      )
    ).toBeNull();
  });

  it("c. BUY covering short AND opening long → lot for long portion with proportional cost", () => {
    // Short −4, buy 10 @ totalValue 1000: after = 6, before = 6 − 10 = −4
    // longPortion = max(0, 6) = 6
    // proportion = 6/10 = 0.6 → cost = 1000 × 0.6 = 600
    // costBasisPerUnit = 600 / 6 = 100
    const lot = createLotDataFromEvent(
      makeEvent({ quantity: "10", totalValue: "1000", runningQuantity: "6" })
    );
    expect(lot).not.toBeNull();
    expect(lot!.lotType).toBe("long");
    expect(lot!.originalQuantity).toBe("6");
    expect(lot!.totalCostBasis).toBe("600.00");
    expect(lot!.costBasisPerUnit).toBe("100.00");
  });

  it("RECEIVE behaves like BUY (acquisition) and trims fractional quantity formatting", () => {
    // Flat, receive 0.5 BTC valued $30,000 total... use 0.5 @ 15000:
    // after = 0.5, before = 0 → long lot of 0.5
    // costBasisPerUnit = 15000 / 0.5 = 30000
    // formatQuantity(0.5) = "0.50000000" → trimmed → "0.5"
    const lot = createLotDataFromEvent(
      makeEvent({
        eventType: "RECEIVE",
        quantity: "0.5",
        totalValue: "15000",
        runningQuantity: "0.5",
      })
    );
    expect(lot).not.toBeNull();
    expect(lot!.lotType).toBe("long");
    expect(lot!.originalQuantity).toBe("0.5");
    expect(lot!.costBasisPerUnit).toBe("30000.00");
    expect(lot!.totalCostBasis).toBe("15000.00");
  });
});

describe("createLotDataFromEvent — SELL", () => {
  it("d1. SELL closing part of a long → null (no lot)", () => {
    // Long 10, sell 4: after = 6, before = 6 + 4 = 10
    // before > 0 and after ≥ 0 → shortPortion = 0 → no lot
    expect(
      createLotDataFromEvent(
        makeEvent({
          eventType: "SELL",
          quantity: "4",
          totalValue: "400",
          runningQuantity: "6",
        })
      )
    ).toBeNull();
  });

  it("d2. SELL from flat opens a short → short lot for full quantity", () => {
    // Flat, sell 5 @ totalValue 750: after = −5, before = −5 + 5 = 0
    // before ≤ 0 → shortPortion = full 5
    // proceeds = 750 × (5/5) = 750; per unit = 750 / 5 = 150
    const lot = createLotDataFromEvent(
      makeEvent({
        eventType: "SELL",
        quantity: "5",
        totalValue: "750",
        runningQuantity: "-5",
      })
    );
    expect(lot).not.toBeNull();
    expect(lot!.lotType).toBe("short");
    expect(lot!.originalQuantity).toBe("5");
    expect(lot!.totalCostBasis).toBe("750.00"); // short "cost basis" = sale proceeds
    expect(lot!.costBasisPerUnit).toBe("150.00");
    expect(lot!.status).toBe("open");
  });

  it("d3. SELL flipping long → short → short lot for the short portion only", () => {
    // Long 3, sell 5 @ totalValue 600: after = −2, before = −2 + 5 = 3
    // before > 0, after < 0 → shortPortion = |−2| = 2
    // proportion = 2/5 = 0.4 → proceeds = 600 × 0.4 = 240; per unit = 240/2 = 120
    const lot = createLotDataFromEvent(
      makeEvent({
        eventType: "SELL",
        quantity: "5",
        totalValue: "600",
        runningQuantity: "-2",
      })
    );
    expect(lot).not.toBeNull();
    expect(lot!.lotType).toBe("short");
    expect(lot!.originalQuantity).toBe("2");
    expect(lot!.totalCostBasis).toBe("240.00");
    expect(lot!.costBasisPerUnit).toBe("120.00");
  });

  it("d4. SELL extending an existing short → short lot for full quantity", () => {
    // Short −5, sell 3 more @ totalValue 330: after = −8, before = −8 + 3 = −5
    // before ≤ 0 → shortPortion = full 3; proceeds = 330; per unit = 110
    const lot = createLotDataFromEvent(
      makeEvent({
        eventType: "SELL",
        quantity: "3",
        totalValue: "330",
        runningQuantity: "-8",
      })
    );
    expect(lot).not.toBeNull();
    expect(lot!.lotType).toBe("short");
    expect(lot!.originalQuantity).toBe("3");
    expect(lot!.totalCostBasis).toBe("330.00");
    expect(lot!.costBasisPerUnit).toBe("110.00");
  });
});

describe("createLotDataFromEvent — non-lot-creating events and errors", () => {
  it("SEND going negative does NOT create a short lot (only SELL does)", () => {
    // NOTE: actual behavior — disposals other than SELL (SEND, FEE, ...) never
    // create lots, even when the running quantity goes negative.
    // Flat, send 5: after = −5
    expect(
      createLotDataFromEvent(
        makeEvent({
          eventType: "SEND",
          quantity: "5",
          totalValue: "500",
          runningQuantity: "-5",
        })
      )
    ).toBeNull();
  });

  it("throws when runningQuantity is missing from event_calculations", () => {
    expect(() =>
      createLotDataFromEvent(makeEvent({ runningQuantity: null }))
    ).toThrow(/runningQuantity/);
  });
});
