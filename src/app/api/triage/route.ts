import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { triageRecords } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id parameter is required" },
        { status: 400 }
      );
    }

    const record = await db
      .select()
      .from(triageRecords)
      .where(eq(triageRecords.id, id))
      .limit(1);

    if (record.length === 0) {
      return NextResponse.json({ error: "Triage record not found" }, { status: 404 });
    }

    return NextResponse.json(record[0]);
  } catch (error) {
    console.error("Error fetching triage record:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch triage record",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
