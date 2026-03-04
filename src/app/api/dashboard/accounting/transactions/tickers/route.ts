import { NextRequest, NextResponse } from "next/server";
import { getTaxTransactionTickers } from "@/db/queries/tax-transactions";

export async function GET(request: NextRequest) {
  try {
    const owner = request.nextUrl.searchParams.get("owner") ?? undefined;
    const tickers = await getTaxTransactionTickers(owner);
    return NextResponse.json(tickers);
  } catch (error) {
    console.error("Tax tickers API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tickers", message: (error as Error)?.message },
      { status: 500 },
    );
  }
}
