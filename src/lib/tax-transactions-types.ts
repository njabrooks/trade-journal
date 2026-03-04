/**
 * Shared types for the Tax Transactions feature.
 * No DB imports — safe for client components.
 */

export interface TaxTransactionRow {
  eventId: string;
  timestamp: string;
  ticker: string;
  assetName: string | null;
  eventType: string;
  tag: string | null;
  quantity: number;
  price: number | null;
  // USD values
  totalValueUsd: number | null;
  acbCostBasisUsd: number | null;
  acbGainUsd: number | null;
  // GBP values
  totalValueGbp: number | null;
  // S104 values (GBP only)
  s104CostBasisGbp: number | null;
  s104GainGbp: number | null;
  // S104 match types (aggregated)
  s104MatchTypes: string[] | null;
  // Owner / account / source
  owner: string;
  account: string;
  source: string;
  // FX
  fxRateToGbp: number | null;
}

export interface TaxTransactionsSummary {
  totalCount: number;
  disposalCount: number;
  totalProceedsUsd: number;
  totalProceedsGbp: number;
  totalAcbGainUsd: number;
  totalS104GainGbp: number;
}

export interface TaxTransactionsResult {
  rows: TaxTransactionRow[];
  summary: TaxTransactionsSummary;
  totalCount: number;
  page: number;
  pageSize: number;
}
