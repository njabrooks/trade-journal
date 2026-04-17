#!/usr/bin/env python3
"""
Fetch live IBKR option quotes for a multi-leg structure via ib_insync.

Connects to IB Gateway (port 4001) or TWS (port 7496).

Usage:
  python3 scripts/ibkr-option-quote.py IBIT "BUY 49C 20260821, BUY 55C 20260821, SELL 60C 20260821 x2, SELL 36P 20260821"

Leg format: ACTION STRIKE[C|P] EXPIRY [xQTY]
"""

import sys
import re
import time

# Use Radon's venv which has ib_insync
sys.path.insert(0, "/Users/home-hub/projects/radon/.venv/lib/python3.14/site-packages")

from ib_insync import IB, Option, util


def parse_legs(text):
    """Parse leg string into structured list."""
    legs = []
    for part in text.split(","):
        part = part.strip()
        m = re.match(r"(BUY|SELL)\s+(\d+(?:\.\d+)?)(C|P)\s+(\d{8})(?:\s+x(\d+))?", part, re.I)
        if not m:
            print(f"  Cannot parse: '{part}'")
            continue
        legs.append({
            "action": m.group(1).upper(),
            "strike": float(m.group(2)),
            "right": m.group(3).upper(),
            "expiry": m.group(4),
            "qty": int(m.group(5)) if m.group(5) else 1,
        })
    return legs


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/ibkr-option-quote.py TICKER \"BUY 49C 20260821, SELL 60C 20260821 x2, ...\"")
        sys.exit(1)

    ticker = sys.argv[1].upper()
    legs = parse_legs(sys.argv[2])

    if not legs:
        print("No valid legs parsed")
        sys.exit(1)

    print(f"\nIBKR Live Quote: {ticker}")
    print(f"Legs: {len(legs)}")
    for l in legs:
        print(f"  {l['action']} {l['qty']}x {l['strike']}{l['right']} {l['expiry']}")

    # Connect to IB Gateway
    ib = IB()
    print(f"\nConnecting to IB Gateway...")

    try:
        ib.connect("127.0.0.1", 4001, clientId=95)  # clientId 95 = standalone script range
    except ConnectionRefusedError:
        try:
            print("  Port 4001 failed, trying TWS on 7496...")
            ib.connect("127.0.0.1", 7496, clientId=95)
        except ConnectionRefusedError:
            print("  Could not connect to IB Gateway (4001) or TWS (7496)")
            print("  Make sure IB Gateway is running and logged in")
            sys.exit(1)

    print(f"  Connected: {ib.managedAccounts()}")

    # Request delayed data (no live subscription required)
    ib.reqMarketDataType(3)  # 3 = delayed, 4 = delayed-frozen
    print("  Market data type: DELAYED")

    # Build option contracts
    contracts = []
    for l in legs:
        c = Option(
            symbol=ticker,
            lastTradeDateOrContractMonth=l["expiry"],
            strike=l["strike"],
            right=l["right"],
            exchange="SMART",
            currency="USD",
        )
        contracts.append((l, c))

    # Qualify contracts (resolve conids)
    print(f"\nQualifying {len(contracts)} contracts...")
    raw_contracts = [c for _, c in contracts]
    qualified = ib.qualifyContracts(*raw_contracts)

    for i, (leg, _) in enumerate(contracts):
        q = qualified[i] if i < len(qualified) else None
        if q and q.conId:
            print(f"  {leg['action']} {leg['qty']}x {leg['strike']}{leg['right']} → conId={q.conId}")
            contracts[i] = (leg, q)
        else:
            print(f"  {leg['action']} {leg['qty']}x {leg['strike']}{leg['right']} → NOT FOUND")

    # Request market data
    print(f"\nFetching live quotes...")
    tickers_map = {}
    for leg, contract in contracts:
        if contract.conId:
            t = ib.reqMktData(contract, "", False, False)
            tickers_map[contract.conId] = (leg, contract, t)

    # Wait for data to populate
    ib.sleep(3)

    # Display results
    print(f"\n{'='*95}")
    print(f"IBKR LIVE QUOTES: {ticker}")
    print(f"{'='*95}")
    print(f"{'Leg':<6} {'Strike':<8} {'Expiry':<10} {'Qty':>4} {'Bid':>8} {'Ask':>8} {'Mid':>8} {'Last':>8} {'IV':>8}")
    print("-" * 95)

    net_bid = 0  # cost to BUY the combo
    net_ask = 0
    net_mid = 0
    all_have_quotes = True

    for leg, contract, ticker_data in tickers_map.values():
        # Try live first, fall back to delayed
        bid = ticker_data.bid if ticker_data.bid > 0 else None
        ask = ticker_data.ask if ticker_data.ask > 0 else None
        last = ticker_data.last if ticker_data.last > 0 else None

        # Delayed data fields
        if bid is None and hasattr(ticker_data, 'delayedBid') and ticker_data.delayedBid > 0:
            bid = ticker_data.delayedBid
        if ask is None and hasattr(ticker_data, 'delayedAsk') and ticker_data.delayedAsk > 0:
            ask = ticker_data.delayedAsk
        if last is None and hasattr(ticker_data, 'delayedLast') and ticker_data.delayedLast > 0:
            last = ticker_data.delayedLast

        mid = (bid + ask) / 2 if bid is not None and ask is not None else None

        # IV from model greeks or delayed greeks
        iv = None
        if hasattr(ticker_data, 'modelGreeks') and ticker_data.modelGreeks:
            iv = ticker_data.modelGreeks.impliedVol

        # Combo pricing
        if bid is not None and ask is not None:
            if leg["action"] == "BUY":
                net_ask += ask * leg["qty"]
                net_bid += bid * leg["qty"]
            else:
                net_ask -= bid * leg["qty"]
                net_bid -= ask * leg["qty"]
            sign = 1 if leg["action"] == "BUY" else -1
            net_mid += sign * mid * leg["qty"]
        else:
            all_have_quotes = False

        qty_str = f"x{leg['qty']}" if leg['qty'] > 1 else ""
        bid_s = f"${bid:.2f}" if bid else "—"
        ask_s = f"${ask:.2f}" if ask else "—"
        mid_s = f"${mid:.2f}" if mid else "—"
        last_s = f"${last:.2f}" if last else "—"
        iv_s = f"{iv:.1%}" if iv else "—"

        print(f"{leg['action']:<6} {leg['strike']}{leg['right']:<6} {leg['expiry']:<10} {qty_str:>4} {bid_s:>8} {ask_s:>8} {mid_s:>8} {last_s:>8} {iv_s:>8}")

    print("-" * 95)

    if all_have_quotes:
        print(f"{'COMBO':<6} {'':14} {'':10} {'':4} ${net_bid:>7.2f} ${net_ask:>7.2f} ${net_mid:>7.2f}")
        print()
        combo_type = "DEBIT" if net_mid > 0 else "CREDIT"
        print(f"Combo Net: ${abs(net_mid):.2f} {combo_type} at mid")
        print(f"  Bid: ${net_bid:.2f} | Ask: ${net_ask:.2f} | Spread: ${net_ask - net_bid:.2f}")
        per_ct = abs(net_mid) * 100
        print(f"  Per contract: ${per_ct:.0f} | 30 contracts: ${per_ct * 30:,.0f}")
    else:
        print("\n  Some quotes unavailable — market may be closed or contracts not found")

    # Cancel market data
    for _, _, t in tickers_map.values():
        ib.cancelMktData(t.contract)

    ib.disconnect()


if __name__ == "__main__":
    main()
