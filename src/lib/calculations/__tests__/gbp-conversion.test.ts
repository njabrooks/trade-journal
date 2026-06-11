/**
 * Golden tests for the pure GBP-conversion helpers:
 *   - canRecoverOriginalGbp: decides whether an event's original GBP amount
 *     can be exactly recovered from ingestion metadata
 *   - usdToGbp: converts USD → GBP, preferring exact recovery over the
 *     fx_rates table rate
 *   - parseEventMetadata: defensive metadata parsing
 *
 * Expectations are hand-computed (arithmetic in comments).
 *
 * gbp-conversion.ts imports "@/db" (directly and via @/lib/fx/get-fx-rate)
 * at module level, and src/db/index.ts THROWS at import when
 * DATABASE_URL_POOLER is blank (vitest.config.ts blanks it). The mock below
 * is an import-time shim only — the pure helpers never touch the db.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  canRecoverOriginalGbp,
  usdToGbp,
  parseEventMetadata,
} from "../gbp-conversion";

describe("canRecoverOriginalGbp", () => {
  it("returns true only for GBP-original events with a real (non-1, positive) ingestion rate", () => {
    expect(canRecoverOriginalGbp({ originalCurrency: "GBP", fxRateToBase: 1.27 })).toBe(true);
  });

  it("rejects non-GBP original currency", () => {
    expect(canRecoverOriginalGbp({ originalCurrency: "USD", fxRateToBase: 1.27 })).toBe(false);
    expect(canRecoverOriginalGbp({ fxRateToBase: 1.27 })).toBe(false);
  });

  it("rejects missing, zero, negative, or exactly-1 ingestion rates", () => {
    expect(canRecoverOriginalGbp({ originalCurrency: "GBP" })).toBe(false);
    expect(canRecoverOriginalGbp({ originalCurrency: "GBP", fxRateToBase: 0 })).toBe(false);
    expect(canRecoverOriginalGbp({ originalCurrency: "GBP", fxRateToBase: -1.2 })).toBe(false);
    // Rate of exactly 1 is treated as "no real conversion happened"
    expect(canRecoverOriginalGbp({ originalCurrency: "GBP", fxRateToBase: 1 })).toBe(false);
    expect(canRecoverOriginalGbp({})).toBe(false);
  });
});

describe("usdToGbp", () => {
  it("falls back to the fx_rates table rate when recovery is not possible", () => {
    // 1,000 USD × 0.79 = £790, effective rate is the table rate
    const r = usdToGbp(1000, 0.79, {});
    expect(r.gbpAmount).toBeCloseTo(790, 8);
    expect(r.effectiveRate).toBe(0.79);
  });

  it("recovers the exact original GBP amount for GBP-original events", () => {
    // Ingestion did: 100 GBP × 1.27 = 127 USD.
    // Recovery: effectiveRate = 1 / 1.27; gbpAmount = 127 / 1.27 = exactly 100.
    // The table rate (0.79) would have given 127 × 0.79 = £100.33 — drift.
    const r = usdToGbp(127, 0.79, { originalCurrency: "GBP", fxRateToBase: 1.27 });
    expect(r.gbpAmount).toBeCloseTo(100, 10);
    expect(r.effectiveRate).toBeCloseTo(1 / 1.27, 12);
    expect(r.gbpAmount).not.toBeCloseTo(127 * 0.79, 2); // confirms table rate NOT used
  });

  it("applies the baseCurrencyDivisor when reversing the ingestion conversion", () => {
    // Ingestion did: originalGbp × fxRateToBase / divisor = USD
    //   e.g. 100 (GBp-denominated units) × 1.27 / 100 = 1.27 USD
    // Recovery: gbpAmount = 1.27 × 100 / 1.27 = 100; effectiveRate = 100/1.27
    const r = usdToGbp(1.27, 0.79, {
      originalCurrency: "GBP",
      fxRateToBase: 1.27,
      baseCurrencyDivisor: 100,
    });
    expect(r.gbpAmount).toBeCloseTo(100, 10);
    expect(r.effectiveRate).toBeCloseTo(100 / 1.27, 10);
  });

  it("defaults the divisor to 1 when absent", () => {
    // effectiveRate = 1 / 2 = 0.5; 50 USD × 0.5 = £25
    const r = usdToGbp(50, 0.8, { originalCurrency: "GBP", fxRateToBase: 2 });
    expect(r.gbpAmount).toBeCloseTo(25, 10);
    expect(r.effectiveRate).toBeCloseTo(0.5, 12);
  });

  it("uses the table rate when metadata names a non-GBP currency, even with a rate present", () => {
    const r = usdToGbp(100, 0.8, { originalCurrency: "EUR", fxRateToBase: 1.1 });
    expect(r.gbpAmount).toBeCloseTo(80, 10);
    expect(r.effectiveRate).toBe(0.8);
  });
});

describe("parseEventMetadata", () => {
  it("returns empty metadata for null / non-object input", () => {
    expect(parseEventMetadata(null)).toEqual({});
    expect(parseEventMetadata(undefined)).toEqual({});
    expect(parseEventMetadata("string")).toEqual({});
    expect(parseEventMetadata(42)).toEqual({});
  });

  it("drops wrong-typed FX fields so recovery falls back to the table rate", () => {
    // fxRateToBase as a string must NOT enable recovery
    const meta = parseEventMetadata({ originalCurrency: "GBP", fxRateToBase: "1.27" });
    expect(meta.originalCurrency).toBe("GBP");
    expect(meta.fxRateToBase).toBeUndefined();
    expect(canRecoverOriginalGbp(meta)).toBe(false);

    const r = usdToGbp(127, 0.79, meta);
    expect(r.effectiveRate).toBe(0.79); // table rate used
  });

  it("parses well-formed FX fields and enables recovery end-to-end", () => {
    const meta = parseEventMetadata({
      originalCurrency: "GBP",
      fxRateToBase: 1.25,
      baseCurrencyDivisor: 1,
      commission: 2.5,
    });
    expect(meta.fxRateToBase).toBe(1.25);
    expect(meta.baseCurrencyDivisor).toBe(1);
    expect(meta.commission).toBe(2.5);
    expect(canRecoverOriginalGbp(meta)).toBe(true);

    // 125 USD / 1.25 = exactly £100
    const r = usdToGbp(125, 0.9, meta);
    expect(r.gbpAmount).toBeCloseTo(100, 10);
  });
});
