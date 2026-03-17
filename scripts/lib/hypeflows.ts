/**
 * HypeFlows API Client
 *
 * Fetches Hyperliquid vs CEX perpetual swap data from hypeflows.com.
 * Free, unauthenticated API — no API key needed.
 *
 * Endpoints:
 *   /api/perp-data?metric=volume      — Daily perp volume by exchange
 *   /api/perp-data?metric=open_interest — Daily open interest by exchange
 *
 * Exchanges: Hyperliquid, Binance, Bybit, OKX, Huobi, Coinbase, Kraken, Bitfinex, Bitget
 *
 * Usage:
 *   import { hypeflows } from './lib/hypeflows.js';
 *   const share = await hypeflows.getMarketShare();
 *   const snapshot = await hypeflows.getLatestSnapshot();
 */

const HYPEFLOWS_BASE = 'https://hypeflows.com/api';
const ALL_MARKETS = 'hyperliquid,binance,bybit,okx,huobi,coinbase,kraken,bitfinex,bitget';

// ============================================================================
// Types
// ============================================================================

export interface ExchangeData {
  [exchange: string]: number; // exchange name → volume or OI in USD
}

export interface DailyData {
  [date: string]: ExchangeData; // YYYY-MM-DD → exchange data
}

export interface MarketShareSnapshot {
  date: string;
  hyperliquidVolume: number;
  totalVolume: number;
  marketSharePct: number;
  hyperliquidOI: number;
  totalOI: number;
  oiSharePct: number;
  volumeByExchange: ExchangeData;
  oiByExchange: ExchangeData;
}

export interface MarketShareTrend {
  dates: string[];
  shares: number[]; // market share % per day
  volumes: number[]; // HL volume per day
}

// ============================================================================
// Core API
// ============================================================================

async function fetchPerpData(metric: 'volume' | 'open_interest', startDate: string): Promise<DailyData> {
  const url = `${HYPEFLOWS_BASE}/perp-data?markets=${ALL_MARKETS}&metric=${metric}&startDate=${startDate}T00:00:00.000Z`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HypeFlows API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function getLastFullDay(data: DailyData): { date: string; values: ExchangeData } | null {
  const dates = Object.keys(data).sort();
  if (dates.length === 0) return null;

  // Last date may be partial (today) — use second to last if available
  // A "full day" has most major exchanges reporting
  for (let i = dates.length - 1; i >= 0; i--) {
    const values = data[dates[i]];
    const hasHL = 'HYPERLIQUID' in values && values.HYPERLIQUID > 0;
    const hasBinance = 'BINANCE' in values && values.BINANCE > 0;
    if (hasHL && hasBinance) {
      return { date: dates[i], values };
    }
  }

  // Fallback to latest available
  const lastDate = dates[dates.length - 1];
  return { date: lastDate, values: data[lastDate] };
}

// ============================================================================
// Public API
// ============================================================================

export const hypeflows = {
  /**
   * Get raw daily volume data by exchange
   * @param days Number of days to fetch (default: 30)
   */
  async getVolume(days: number = 30): Promise<DailyData> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return fetchPerpData('volume', startDate);
  },

  /**
   * Get raw daily open interest data by exchange
   * @param days Number of days to fetch (default: 30)
   */
  async getOpenInterest(days: number = 30): Promise<DailyData> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return fetchPerpData('open_interest', startDate);
  },

  /**
   * Get the latest full-day market share snapshot
   * Returns Hyperliquid's share of global perp volume and OI
   */
  async getLatestSnapshot(): Promise<MarketShareSnapshot> {
    const [volumeData, oiData] = await Promise.all([
      this.getVolume(7),
      this.getOpenInterest(7),
    ]);

    const latestVol = getLastFullDay(volumeData);
    const latestOI = getLastFullDay(oiData);

    if (!latestVol || !latestOI) {
      throw new Error('No data available from HypeFlows');
    }

    const totalVolume = Object.values(latestVol.values).reduce((a, b) => a + b, 0);
    const hlVolume = latestVol.values.HYPERLIQUID || 0;
    const totalOI = Object.values(latestOI.values).reduce((a, b) => a + b, 0);
    const hlOI = latestOI.values.HYPERLIQUID || 0;

    return {
      date: latestVol.date,
      hyperliquidVolume: hlVolume,
      totalVolume,
      marketSharePct: totalVolume > 0 ? (hlVolume / totalVolume) * 100 : 0,
      hyperliquidOI: hlOI,
      totalOI,
      oiSharePct: totalOI > 0 ? (hlOI / totalOI) * 100 : 0,
      volumeByExchange: latestVol.values,
      oiByExchange: latestOI.values,
    };
  },

  /**
   * Get market share trend over time
   * @param days Number of days (default: 30)
   */
  async getMarketShareTrend(days: number = 30): Promise<MarketShareTrend> {
    const volumeData = await this.getVolume(days);
    const dates = Object.keys(volumeData).sort();

    const shares: number[] = [];
    const volumes: number[] = [];

    for (const date of dates) {
      const dayData = volumeData[date];
      const total = Object.values(dayData).reduce((a, b) => a + b, 0);
      const hl = dayData.HYPERLIQUID || 0;
      // Skip days where HL or total is 0 (partial data)
      if (total > 0 && hl > 0) {
        shares.push((hl / total) * 100);
        volumes.push(hl);
      } else {
        shares.push(0);
        volumes.push(0);
      }
    }

    return { dates, shares, volumes };
  },

  /**
   * Get a formatted summary string for the thesis monitor report
   */
  async getSummary(): Promise<string> {
    const snapshot = await this.getLatestSnapshot();
    const lines = [
      `HypeFlows Market Share (${snapshot.date}):`,
      `  Volume: HL $${(snapshot.hyperliquidVolume / 1e9).toFixed(1)}B / Total $${(snapshot.totalVolume / 1e9).toFixed(1)}B = ${snapshot.marketSharePct.toFixed(1)}% share`,
      `  OI:     HL $${(snapshot.hyperliquidOI / 1e9).toFixed(1)}B / Total $${(snapshot.totalOI / 1e9).toFixed(1)}B = ${snapshot.oiSharePct.toFixed(1)}% share`,
      '',
      'Volume by exchange:',
    ];

    const sorted = Object.entries(snapshot.volumeByExchange).sort((a, b) => b[1] - a[1]);
    for (const [exchange, vol] of sorted) {
      const pct = (vol / snapshot.totalVolume) * 100;
      lines.push(`  ${exchange.padEnd(15)} $${(vol / 1e9).toFixed(1)}B (${pct.toFixed(1)}%)`);
    }

    return lines.join('\n');
  },
};
