/**
 * Trade detail type for displaying trade information
 * Used by triage components and trade display cards
 */
export interface TradeDetail {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  grossAmount: number | null;
  netAmount: number | null;
  fees: number | null;
  assetClass: string | null;
  exchange: string | null;
  orderType: string | null;
  currency: string | null;
  tradeDate: string;
}
