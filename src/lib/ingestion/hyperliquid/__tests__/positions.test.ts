import { describe, expect, it } from "vitest";

import type { HLClearinghouseState } from "@/lib/ingestion/hyperliquid/api";
import { normalizeHLPerpPositions } from "@/lib/ingestion/hyperliquid/positions";

describe("normalizeHLPerpPositions", () => {
  it("normalizes HIP-3 dex-prefixed perp positions", () => {
    const state: HLClearinghouseState = {
      assetPositions: [
        {
          type: "oneWay",
          position: {
            coin: "xyz:SPCX",
            szi: "1010.0",
            entryPx: "170.8908",
            positionValue: "180365.8",
            unrealizedPnl: "7766.0514",
            marginUsed: "71714.075743",
            liquidationPx: "110.3343226778",
            leverage: { type: "isolated", value: 5 },
            returnOnEquity: "0.224972848",
            maxLeverage: 20,
            cumFunding: {
              allTime: "329.7388",
              sinceChange: "374.268456",
              sinceOpen: "329.7388",
            },
          },
        },
      ],
      marginSummary: {
        accountValue: "71714.075743",
        totalNtlPos: "180365.8",
        totalMarginUsed: "71714.075743",
      },
      withdrawable: "0.0",
      time: 1781871831868,
    };

    const positions = normalizeHLPerpPositions(
      state,
      "account-1",
      new Map([["XYZ:SPCX", 178.49]]),
      "2026-06-19"
    );

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      accountId: "account-1",
      assetClass: "PERP",
      symbol: "XYZ:SPCX",
      side: "LONG",
      quantity: "1010",
      spot: "178.49",
      absNotional: "180365.8",
      marketValueUsd: "180365.8",
      unrealizedPnl: "7766.0514",
      snapshotDate: "2026-06-19",
    });
  });
});
