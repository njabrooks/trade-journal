import { NextResponse } from "next/server";
import { getAccountingPositions } from "@/db/queries/accounting";

export async function GET() {
  try {
    const positions = await getAccountingPositions();
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
