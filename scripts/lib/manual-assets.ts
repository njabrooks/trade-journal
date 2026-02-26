/**
 * Shared constants and helpers for manual assets (HOUSE_UK, FTX_CLAIM_USD).
 */

// ── Constants ────────────────────────────────────────────────────────

export const HOUSE_UK_GBP_VALUE = 1_860_000;
export const HOUSE_UK_PURCHASE_DATE = '2022-08-01';
export const HOUSE_UK_TICKER = 'HOUSE_UK';
export const HOUSE_UK_OWNER = 'Nick';
export const HOUSE_UK_ACCOUNT = 'Manual';

export const FTX_CLAIM_USD_VALUE = 97_374.81;
export const FTX_CLAIM_DATE = '2022-11-11';
export const FTX_CLAIM_TICKER = 'FTX_CLAIM_USD';
export const FTX_CLAIM_OWNER = 'TTC';
export const FTX_CLAIM_ACCOUNT = 'FTX';

export const USER_ID = 'user_2mYzScugP7zfcqv8Ox21i7q9nyW';

export const GBP_USD_FALLBACK = 1.26;

// ── GBP/USD fetch ────────────────────────────────────────────────────

export async function fetchGbpUsdRate(): Promise<number> {
  const url = 'https://api.kraken.com/0/public/Ticker?pair=GBPUSD';
  const response = await fetch(url);
  const json = await response.json() as {
    error: string[];
    result: Record<string, { c: [string, string] }>;
  };
  if (json.error?.length > 0) throw new Error(json.error.join(', '));
  const pair = Object.values(json.result)[0];
  return parseFloat(pair.c[0]);
}

export async function getGbpUsdRate(): Promise<number> {
  try {
    const rate = await fetchGbpUsdRate();
    console.log(`[ManualAssets] GBP/USD rate: ${rate.toFixed(4)}`);
    return rate;
  } catch (error) {
    console.warn(`[ManualAssets] GBP/USD fetch failed, using fallback ${GBP_USD_FALLBACK}:`, error);
    return GBP_USD_FALLBACK;
  }
}
