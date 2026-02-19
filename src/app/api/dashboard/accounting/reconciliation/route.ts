import { NextResponse } from "next/server";
import { getReconciliation } from "@/db/queries/reconciliation";

export async function GET() {
  try {
    const data = await getReconciliation();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching reconciliation data:", error);
    return NextResponse.json(
      { error: "Failed to fetch reconciliation data" },
      { status: 500 }
    );
  }
}
