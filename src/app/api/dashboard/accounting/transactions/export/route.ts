import { NextRequest, NextResponse } from "next/server";
import { exportTaxTransactionsCsv, type TaxTransactionsFilters } from "@/db/queries/tax-transactions";

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

    const csv = await exportTaxTransactionsCsv(filters);

    const owner = filters.owner ?? "all";
    const year = filters.taxYearStart?.slice(0, 4) ?? "all";
    const filename = `tax-transactions-${owner}-${year}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Tax transactions CSV export error:", error);
    return NextResponse.json(
      { error: "Failed to export", message: (error as Error)?.message },
      { status: 500 },
    );
  }
}
