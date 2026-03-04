import { NextRequest, NextResponse } from "next/server";
import {
  getTaxTransactions,
  getTaxTransactionTickers,
  getTaxYears,
  type TaxTransactionsFilters,
} from "@/db/queries/tax-transactions";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const filters: TaxTransactionsFilters = {
      owner: params.get("owner") ?? undefined,
      taxYearStart: params.get("taxYearStart") ?? undefined,
      taxYearEnd: params.get("taxYearEnd") ?? undefined,
      assetTicker: params.get("asset") ?? undefined,
      eventType: (params.get("eventType") as TaxTransactionsFilters["eventType"]) ?? undefined,
      matchType: params.get("matchType") ?? undefined,
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
