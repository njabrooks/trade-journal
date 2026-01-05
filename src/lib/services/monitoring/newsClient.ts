/**
 * News monitoring client using Finnhub API
 * Free tier: 60 calls/minute
 * https://finnhub.io/docs/api/market-news
 */

import type { DataSourceResult } from './types';

export interface NewsQueryParams {
  keywords: string[];
  tickers?: string[]; // Optional ticker filter
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  category?: 'general' | 'forex' | 'crypto' | 'merger';
}

interface FinnhubNewsArticle {
  category: string;
  datetime: number; // Unix timestamp
  headline: string;
  id: number;
  image: string;
  related: string; // Ticker symbol
  source: string;
  summary: string;
  url: string;
}

/**
 * Query news from Finnhub API
 */
export async function queryNews(params: NewsQueryParams): Promise<DataSourceResult[]> {
  const { keywords, tickers, startDate, endDate, category = 'general' } = params;

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error('FINNHUB_API_KEY not configured');
  }

  // Convert dates to Unix timestamps
  const fromTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const toTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

  try {
    let articles: FinnhubNewsArticle[] = [];

    if (tickers && tickers.length > 0) {
      // Query company-specific news for each ticker
      const tickerQueries = tickers.map((ticker) =>
        fetchCompanyNews(apiKey, ticker, fromTimestamp, toTimestamp)
      );
      const tickerResults = await Promise.all(tickerQueries);
      articles = tickerResults.flat();
    } else {
      // Query general market news
      articles = await fetchMarketNews(apiKey, category);

      // Filter by date range
      articles = articles.filter(
        (article) => article.datetime >= fromTimestamp && article.datetime <= toTimestamp
      );
    }

    // Filter by keywords
    const filtered = filterByKeywords(articles, keywords);

    // Transform to DataSourceResult format
    return filtered.map((article) => ({
      title: article.headline,
      date: new Date(article.datetime * 1000).toISOString(),
      source: article.source,
      snippet: article.summary,
      link: article.url,
      rawData: {
        category: article.category,
        related: article.related,
        image: article.image,
      },
    }));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Finnhub API error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Fetch company-specific news
 */
async function fetchCompanyNews(
  apiKey: string,
  ticker: string,
  from: number,
  to: number
): Promise<FinnhubNewsArticle[]> {
  const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${new Date(
    from * 1000
  )
    .toISOString()
    .split('T')[0]}&to=${new Date(to * 1000)
    .toISOString()
    .split('T')[0]}&token=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded (60 calls/minute)');
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch general market news
 */
async function fetchMarketNews(
  apiKey: string,
  category: string
): Promise<FinnhubNewsArticle[]> {
  const url = `https://finnhub.io/api/v1/news?category=${category}&token=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded (60 calls/minute)');
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Filter articles by keyword match in headline or summary
 */
function filterByKeywords(
  articles: FinnhubNewsArticle[],
  keywords: string[]
): FinnhubNewsArticle[] {
  if (keywords.length === 0) {
    return articles;
  }

  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  return articles.filter((article) => {
    const text = `${article.headline} ${article.summary}`.toLowerCase();
    return lowerKeywords.some((keyword) => text.includes(keyword));
  });
}

/**
 * Validate Finnhub API key
 */
export async function validateFinnhubApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`
    );
    return response.ok;
  } catch {
    return false;
  }
}
