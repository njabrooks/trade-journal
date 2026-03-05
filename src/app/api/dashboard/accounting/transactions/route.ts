import { NextRequest, NextResponse } from "next/server";
import {
  getTaxTransactions,
  type TaxTransactionsFilters,
  type TaxTransactionSortKey,
  type SortDir,
} from "@/db/queries/tax-transactions";

const VALID_SORT_KEYS = new Set<TaxTransactionSortKey>([
  "timestamp", "ticker", "eventType", "quantity", "price", "proceeds", "costBasis", "gain",
]);

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const rawSortKey = params.get("sortKey");
    const rawSortDir = params.get("sortDir");

    const filters: TaxTransactionsFilters = {
      owner: params.get("owner") ?? undefined,
      taxYearStart: params.get("taxYearStart") ?? undefined,
      taxYearEnd: params.get("taxYearEnd") ?? undefined,
      assetTicker: params.get("asset") ?? undefined,
      eventType: (params.get("eventType") as TaxTransactionsFilters["eventType"]) ?? undefined,
      matchType: params.get("matchType") ?? undefined,
      sortKey: rawSortKey && VALID_SORT_KEYS.has(rawSortKey as TaxTransactionSortKey) ? rawSortKey as TaxTransactionSortKey : undefined,
      sortDir: rawSortDir === "desc" ? "desc" : rawSortDir === "asc" ? "asc" : undefined,
      currency: params.get("currency") === "USD" ? "USD" : params.get("currency") === "GBP" ? "GBP" : undefined,
    };

    const page = Number(params.get("page") ?? 1);
    const pageSize = Number(params.get("pageSize") ?? 50);

    const result = await getTaxTransactions(filters, page, pageSize);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Tax transactions API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tax transactions", message: (error as Error)?.message },
      { status: 500 },
    );
  }
}
