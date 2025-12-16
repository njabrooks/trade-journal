import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { toNumber } from "@/lib/numbers";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const idsParam = searchParams.get("ids");

    if (!idsParam) {
      return NextResponse.json(
        { error: "ids parameter is required" },
        { status: 400 }
      );
    }

    const tradeIds = idsParam.split(",").filter((id) => id.trim().length > 0);

    if (tradeIds.length === 0) {
      return NextResponse.json([]);
    }

    const tradeRows = await db
      .select({
        id: trades.id,
        symbol: trades.symbol,
        side: trades.side,
        quantity: trades.quantity,
        price: trades.price,
        grossAmount: trades.grossAmount,
        netAmount: trades.netAmount,
        fees: trades.fees,
        assetClass: trades.assetClass,
        exchange: trades.exchange,
        orderType: trades.orderType,
        currency: trades.currency,
        tradeDate: trades.tradeDate,
      })
      .from(trades)
      .where(inArray(trades.id, tradeIds));

    // Format trades to match TradeDetailsCard expected format
    const formatted = tradeRows.map((trade) => ({
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      quantity: toNumber(trade.quantity) || 0,
      price: toNumber(trade.price) || 0,
      grossAmount: toNumber(trade.grossAmount),
      netAmount: toNumber(trade.netAmount),
      fees: toNumber(trade.fees),
      assetClass: trade.assetClass ?? null,
      exchange: trade.exchange ?? null,
      orderType: trade.orderType ?? null,
      currency: trade.currency ?? null,
      tradeDate: trade.tradeDate.toISOString(),
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Error fetching trades:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch trades",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

