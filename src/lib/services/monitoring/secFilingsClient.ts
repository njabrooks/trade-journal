/**
 * SEC EDGAR filings client
 * Free API, no key required
 * Rate limit: 10 requests/second
 * https://www.sec.gov/developer
 */

import type { DataSourceResult } from './types';

export interface SecFilingsQueryParams {
  ticker: string;
  filingTypes: ('8-K' | '10-Q' | '10-K' | '13F' | '4')[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  keywords?: string[]; // Optional keyword search within filings
}

interface EdgarFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  acceptanceDateTime: string;
  act: string;
  form: string;
  fileNumber: string;
  filmNumber: string;
  items: string;
  size: number;
  isXBRL: boolean;
  isInlineXBRL: boolean;
  primaryDocument: string;
  primaryDocDescription: string;
}

interface EdgarCompanyResponse {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  insiderTransactionForOwnerExists: boolean;
  insiderTransactionForIssuerExists: boolean;
  name: string;
  tickers: string[];
  exchanges: string[];
  ein: string;
  description: string;
  website: string;
  investorWebsite: string;
  category: string;
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  stateOfIncorporationDescription: string;
  addresses: any;
  phone: string;
  flags: string;
  formerNames: any[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      acceptanceDateTime: string[];
      act: string[];
      form: string[];
      fileNumber: string[];
      filmNumber: string[];
      items: string[];
      size: number[];
      isXBRL: number[];
      isInlineXBRL: number[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // 100ms = 10 requests/second

/**
 * Query SEC EDGAR filings
 */
export async function querySecFilings(
  params: SecFilingsQueryParams
): Promise<DataSourceResult[]> {
  const { ticker, filingTypes, startDate, endDate, keywords = [] } = params;

  console.log('[SEC] Query params:', { ticker, filingTypes, startDate, endDate, keywords });

  try {
    // Get company CIK and filings data
    const companyData = await fetchCompanyFilings(ticker);

    if (!companyData) {
      throw new Error(`Company not found for ticker ${ticker}`);
    }

    console.log('[SEC] Company found:', { name: companyData.name, cik: companyData.cik });

    // Parse recent filings
    const filings = parseRecentFilings(companyData.filings.recent);
    console.log('[SEC] Total filings parsed:', filings.length);

    // Filter by date range
    const start = new Date(startDate);
    const end = new Date(endDate);

    const filtered = filings.filter((filing) => {
      const filingDate = new Date(filing.filingDate);
      return filingDate >= start && filingDate <= end;
    });

    console.log('[SEC] After date filter:', filtered.length, `(${startDate} to ${endDate})`);

    // Filter by filing type
    const typeFiltered = filtered.filter((filing) =>
      filingTypes.includes(filing.form as any)
    );

    console.log('[SEC] After type filter:', typeFiltered.length, `(types: ${filingTypes.join(', ')})`);

    // If keywords provided, filter by items field or fetch document text
    // For MVP, we'll just match keywords in the items field (e.g., "Item 2.02" for 8-K)
    // Exclude ticker from keyword search (ticker is already used for company selection)
    const searchKeywords = keywords.filter((k) => k.toUpperCase() !== ticker.toUpperCase());

    let keywordFiltered = typeFiltered;
    if (searchKeywords.length > 0) {
      keywordFiltered = typeFiltered.filter((filing) => {
        const itemsText = filing.items.toLowerCase();
        const descText = filing.primaryDocDescription?.toLowerCase() || '';
        const searchText = `${itemsText} ${descText}`;
        return searchKeywords.some((keyword) => searchText.includes(keyword.toLowerCase()));
      });

      console.log('[SEC] After keyword filter:', keywordFiltered.length, `(keywords: ${searchKeywords.join(', ')})`);
    } else {
      console.log('[SEC] No keyword filtering (only ticker provided)');
    }

    // Transform to DataSourceResult format
    return keywordFiltered.map((filing) => {
      const filingUrl = constructFilingUrl(
        companyData.cik,
        filing.accessionNumber,
        filing.primaryDocument
      );

      return {
        title: `${filing.form}: ${filing.primaryDocDescription || 'Filing'}`,
        date: filing.filingDate,
        source: 'SEC EDGAR',
        snippet: `Filing Date: ${filing.filingDate}. ${
          filing.items ? `Items: ${filing.items}` : ''
        }`,
        link: filingUrl,
        rawData: {
          accessionNumber: filing.accessionNumber,
          form: filing.form,
          reportDate: filing.reportDate,
          items: filing.items,
          cik: companyData.cik,
        },
      };
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`SEC EDGAR query failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Fetch company filings data from EDGAR
 */
async function fetchCompanyFilings(ticker: string): Promise<EdgarCompanyResponse | null> {
  // Rate limiting
  await enforceRateLimit();

  const url = `https://data.sec.gov/submissions/CIK${await getCikFromTicker(ticker)}.json`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Trade Journal Monitoring System contact@example.com', // Required by SEC
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`SEC API HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get CIK (Central Index Key) from ticker symbol
 * Uses SEC's company tickers JSON
 */
async function getCikFromTicker(ticker: string): Promise<string> {
  // Rate limiting
  await enforceRateLimit();

  const url = 'https://www.sec.gov/files/company_tickers.json';

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Trade Journal Monitoring System contact@example.com',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch company tickers: ${response.statusText}`);
  }

  const data = await response.json();

  // Find company by ticker
  const upperTicker = ticker.toUpperCase();
  const company = Object.values(data).find(
    (c: any) => c.ticker.toUpperCase() === upperTicker
  ) as any;

  if (!company) {
    throw new Error(`CIK not found for ticker ${ticker}`);
  }

  // Pad CIK to 10 digits
  return String(company.cik_str).padStart(10, '0');
}

/**
 * Parse recent filings from API response
 */
function parseRecentFilings(recent: EdgarCompanyResponse['filings']['recent']): EdgarFiling[] {
  const filings: EdgarFiling[] = [];

  const count = recent.accessionNumber.length;

  for (let i = 0; i < count; i++) {
    filings.push({
      accessionNumber: recent.accessionNumber[i],
      filingDate: recent.filingDate[i],
      reportDate: recent.reportDate[i],
      acceptanceDateTime: recent.acceptanceDateTime[i],
      act: recent.act[i],
      form: recent.form[i],
      fileNumber: recent.fileNumber[i],
      filmNumber: recent.filmNumber[i],
      items: recent.items[i],
      size: recent.size[i],
      isXBRL: recent.isXBRL[i] === 1,
      isInlineXBRL: recent.isInlineXBRL[i] === 1,
      primaryDocument: recent.primaryDocument[i],
      primaryDocDescription: recent.primaryDocDescription[i],
    });
  }

  return filings;
}

/**
 * Construct URL to filing document
 */
function constructFilingUrl(cik: string, accessionNumber: string, document: string): string {
  // Remove dashes from accession number for URL
  const accessionNoHyphens = accessionNumber.replace(/-/g, '');

  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoHyphens}/${document}`;
}

/**
 * Enforce rate limit (10 requests/second)
 */
async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();
}

/**
 * Validate SEC EDGAR availability
 */
export async function validateSecEdgarAvailability(): Promise<boolean> {
  try {
    await enforceRateLimit();

    const response = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: {
        'User-Agent': 'Trade Journal Monitoring System contact@example.com',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}
