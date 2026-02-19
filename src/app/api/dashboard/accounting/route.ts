import { NextRequest, NextResponse } from "next/server";
import { getAccountingDashboard } from "@/db/queries/accounting";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const range = searchParams.get("range") ?? "1Y";

    const daysBack = rangeToDays(range);
    const data = await getAccountingDashboard(daysBack);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching accounting dashboard data:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch accounting dashboard data",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function rangeToDays(range: string): number {
  switch (range) {
    case "1M":
      return 30;
    case "3M":
      return 90;
    case "6M":
      return 180;
    case "1Y":
      return 365;
    case "YTD": {
      const now = new Date();
      const jan1 = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((now.getTime() - jan1.getTime()) / 86400000);
    }
    case "ALL":
      return 99999;
    default:
      return 365;
  }
}
