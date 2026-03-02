import { NextRequest, NextResponse } from "next/server";
import { getAccountingPositions, type AccountingCurrency } from "@/db/queries/accounting";

export async function GET(request: NextRequest) {
  try {
    const currency = (request.nextUrl.searchParams.get("currency") ?? "USD") as AccountingCurrency;
    const positions = await getAccountingPositions(currency);
    return NextResponse.json(positions);
  } catch (error) {
    console.error("Error fetching accounting positions:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch accounting positions",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
