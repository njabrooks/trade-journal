/**
 * Golden tests for exchange pair/ticker normalization.
 * Module is pure (no DB import) — safe to import directly.
 */
import { describe, it, expect } from "vitest";

import {
  normalizeKrakenPair,
  extractKrakenQuoteCurrency,
  normalizeCoinbasePrimePair,
  extractCoinbasePrimeQuoteCurrency,
  normalizeHyperliquidCoin,
  getHLSpotCanonicalTicker,
  normalizeDeribitCurrency,
  normalizeSolanaTokenSymbol,
} from "@/lib/ingestion/crypto/pairNormalization";

describe("normalizeKrakenPair", () => {
  it("maps legacy X/Z pairs via the asset map", () => {
    // "XXBTZUSD": strip ZUSD → "XXBT" → map → BTC
    expect(normalizeKrakenPair("XXBTZUSD")).toBe("BTC");
    // "XETHZEUR": strip ZEUR → "XETH" → map → ETH
    expect(normalizeKrakenPair("XETHZEUR")).toBe("ETH");
    // "XXDGZUSD": strip ZUSD → "XXDG" → map → DOGE
    expect(normalizeKrakenPair("XXDGZUSD")).toBe("DOGE");
    // "XBTUSDT": USDT stripped (longest-match before USD) → "XBT" → map → BTC
    expect(normalizeKrakenPair("XBTUSDT")).toBe("BTC");
  });

  it("handles modern clean pairs", () => {
    // "SOLUSD": strip USD → SOL (no map entry, no X prefix)
    expect(normalizeKrakenPair("SOLUSD")).toBe("SOL");
    // "BTCUSDC": strip USDC → BTC
    expect(normalizeKrakenPair("BTCUSDC")).toBe("BTC");
    // "DOTEUR": strip EUR → DOT
    expect(normalizeKrakenPair("DOTEUR")).toBe("DOT");
  });

  it("strips leading X only when the base is longer than 3 chars", () => {
    // Unmapped legacy-style base "XTEST" (5 chars, starts with X) → strip → TEST
    expect(normalizeKrakenPair("XTESTUSD")).toBe("TEST");
    // Base "XDOT" (4 chars) hits the asset map before the X-strip → DOT
    expect(normalizeKrakenPair("XDOTUSD")).toBe("DOT");
    // 3-char X-base is NOT stripped: "XRPEUR" → strip EUR → base "XRP"
    // (not in map; starts with X but length 3, not > 3) → kept as "XRP"
    expect(normalizeKrakenPair("XRPEUR")).toBe("XRP");
  });

  it("normalizes Tezos correctly: Z-suffix only accepted for mapped legacy bases", () => {
    // Regression test for a latent bug found when this suite was written:
    // the quote stripper used to match the 4-char "ZUSD" before "USD",
    // truncating "XTZUSD" to base "XT". Z-prefixed quotes are now only
    // accepted when the remaining base resolves in KRAKEN_ASSET_MAP, so
    // Tezos parses as XTZ + USD.
    expect(normalizeKrakenPair("XTZUSD")).toBe("XTZ");
    expect(normalizeKrakenPair("XTZEUR")).toBe("XTZ");
    // Legacy mapped bases still take the Z-suffix path:
    expect(normalizeKrakenPair("XXBTZUSD")).toBe("BTC");
    expect(normalizeKrakenPair("XETHZEUR")).toBe("ETH");
  });
});

describe("extractKrakenQuoteCurrency", () => {
  it("matches Z-prefixed fiat suffixes and strips the Z", () => {
    expect(extractKrakenQuoteCurrency("XXBTZUSD")).toBe("USD"); // ZUSD → USD
    expect(extractKrakenQuoteCurrency("XETHZEUR")).toBe("EUR"); // ZEUR → EUR
    expect(extractKrakenQuoteCurrency("XXBTZGBP")).toBe("GBP"); // ZGBP → GBP
  });

  it("matches plain suffixes, longest first", () => {
    expect(extractKrakenQuoteCurrency("SOLUSD")).toBe("USD");
    // USDT (4 chars) must win over USD (3 chars) on "BTCUSDT"
    expect(extractKrakenQuoteCurrency("BTCUSDT")).toBe("USDT");
    expect(extractKrakenQuoteCurrency("ETHUSDC")).toBe("USDC");
    expect(extractKrakenQuoteCurrency("DOTEUR")).toBe("EUR");
  });

  it("defaults to USD when no suffix matches", () => {
    expect(extractKrakenQuoteCurrency("FOO")).toBe("USD");
  });
});

describe("normalizeCoinbasePrimePair / extractCoinbasePrimeQuoteCurrency", () => {
  it("takes the base leg of product_id, uppercased", () => {
    expect(normalizeCoinbasePrimePair("BTC-USD")).toBe("BTC");
    expect(normalizeCoinbasePrimePair("ETH-USDC")).toBe("ETH");
    expect(normalizeCoinbasePrimePair("sol-usd")).toBe("SOL");
  });

  it("takes the quote leg, defaulting to USD when absent", () => {
    expect(extractCoinbasePrimeQuoteCurrency("BTC-USD")).toBe("USD");
    expect(extractCoinbasePrimeQuoteCurrency("ETH-USDC")).toBe("USDC");
    expect(extractCoinbasePrimeQuoteCurrency("BTC")).toBe("USD"); // no '-' → default
  });
});

describe("normalizeHyperliquidCoin", () => {
  it("passes perp coins through uppercased", () => {
    expect(normalizeHyperliquidCoin("BTC")).toBe("BTC");
    expect(normalizeHyperliquidCoin("eth")).toBe("ETH");
  });

  it("resolves @N spot indices via the spotMeta map", () => {
    const spotMeta = new Map<string, string>([
      ["@1", "PURR"],
      ["@156", "UZEC"],
    ]);
    expect(normalizeHyperliquidCoin("@1", spotMeta)).toBe("PURR");
    // Map values are uppercased on the way out
    expect(normalizeHyperliquidCoin("@156", spotMeta)).toBe("UZEC");
  });

  it("returns the raw @N coin when no spotMeta entry (or no map) is available", () => {
    const spotMeta = new Map<string, string>([["@1", "PURR"]]);
    expect(normalizeHyperliquidCoin("@2", spotMeta)).toBe("@2"); // not in map
    expect(normalizeHyperliquidCoin("@1")).toBe("@1"); // no map provided
  });

  it("does NOT apply spot aliases itself — that's getHLSpotCanonicalTicker's job", () => {
    // NOTE: actual behavior — normalizeHyperliquidCoin("UZEC") returns "UZEC";
    // the UZEC→ZEC alias is only applied by getHLSpotCanonicalTicker.
    expect(normalizeHyperliquidCoin("UZEC")).toBe("UZEC");
  });
});

describe("getHLSpotCanonicalTicker", () => {
  it("maps HL spot aliases to canonical underlyings", () => {
    expect(getHLSpotCanonicalTicker("UZEC")).toBe("ZEC");
    expect(getHLSpotCanonicalTicker("uzec")).toBe("ZEC"); // case-insensitive
  });

  it("falls back to the uppercased symbol when no alias exists", () => {
    expect(getHLSpotCanonicalTicker("BTC")).toBe("BTC");
    expect(getHLSpotCanonicalTicker("purr")).toBe("PURR");
  });

  it("composes with normalizeHyperliquidCoin for @N spot fills", () => {
    // Full spot pipeline: "@156" → spotMeta → "UZEC" → alias → "ZEC"
    const spotMeta = new Map<string, string>([["@156", "UZEC"]]);
    expect(getHLSpotCanonicalTicker(normalizeHyperliquidCoin("@156", spotMeta))).toBe("ZEC");
  });
});

describe("normalizeDeribitCurrency / normalizeSolanaTokenSymbol", () => {
  it("uppercases Deribit currencies", () => {
    expect(normalizeDeribitCurrency("btc")).toBe("BTC");
    expect(normalizeDeribitCurrency("ETH")).toBe("ETH");
    expect(normalizeDeribitCurrency("usdc")).toBe("USDC");
  });

  it("uppercases Solana token symbols", () => {
    expect(normalizeSolanaTokenSymbol("sol")).toBe("SOL");
    expect(normalizeSolanaTokenSymbol("Bonk")).toBe("BONK");
  });
});
