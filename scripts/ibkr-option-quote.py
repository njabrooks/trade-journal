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

# Use Radon's venv which has ib_insync
sys.path.insert(0, "/Users/home-hub/projects/radon/.venv/lib/python3.14/site-packages")

from lib.ibkr_option_quote_boundary import (  # noqa: E402
    INTERACTIVE_QUOTE_CLIENT_ID,
    positive_number,
    qualify_requested_option,
)


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


def connect_quote_gateway(ib):
    """Connect for quotes without acquiring gateway lifecycle authority."""
    for port in (4001, 7496):
        try:
            ib.connect(
                "127.0.0.1",
                port,
                clientId=INTERACTIVE_QUOTE_CLIENT_ID,
                timeout=20,
            )
            return True, None
        except Exception:
            continue
    return False, "gateway-unavailable"


def main():
    from ib_insync import IB, Option  # noqa: E402

    if len(sys.argv) < 3:
        print("Usage: python3 scripts/ibkr-option-quote.py TICKER \"BUY 49C 20260821, SELL 60C 20260821 x2, ...\"")
        return 1

    ticker = sys.argv[1].upper()
    legs = parse_legs(sys.argv[2])

    if not legs:
        print("No valid legs parsed")
        return 1

    print(f"\nIBKR Live Quote: {ticker}")
    print(f"Legs: {len(legs)}")
    for l in legs:
        print(f"  {l['action']} {l['qty']}x {l['strike']}{l['right']} {l['expiry']}")

    # Connect to IB Gateway
    ib = IB()
    print(f"\nConnecting to IB Gateway...")

    connected, unavailable_reason = connect_quote_gateway(ib)
    if not connected:
        print(f"  UNAVAILABLE: {unavailable_reason}")
        print("  Gateway lifecycle recovery belongs to the separate /gateway workflow")
        return 2

    print(f"  Connected: {ib.managedAccounts()}")

    # Live data by default (nick gateway profile carries the streaming bundle);
    # --delayed forces type 3 for sessions on an unentitled login
    if "--delayed" in sys.argv:
        ib.reqMarketDataType(3)  # 3 = delayed, 4 = delayed-frozen
        print("  Market data type: DELAYED (forced)")
    else:
        ib.reqMarketDataType(1)  # 1 = live; unentitled contracts just won't populate
        print("  Market data type: LIVE (use --delayed if quotes come back empty)")

    # Build option contracts
    contracts = []
    for l in legs:
        request = {
            "ticker": ticker,
            "expiry": l["expiry"],
            "strike": l["strike"],
            "right": l["right"],
        }
        contract, reason = qualify_requested_option(
            ib,
            request,
            Option,
        )
        contracts.append((l, contract))
        if contract is not None:
            print(f"  {l['action']} {l['qty']}x {l['strike']}{l['right']} → conId={contract.conId}")
        else:
            print(f"  {l['action']} {l['qty']}x {l['strike']}{l['right']} → UNAVAILABLE: {reason}")

    # Request market data
    print(f"\nFetching live quotes...")
    tickers_map = {}
    for leg, contract in contracts:
        if contract is not None and contract.conId:
            try:
                t = ib.reqMktData(contract, "", False, False)
            except Exception:
                continue
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
    all_have_quotes = len(tickers_map) == len(contracts)

    for leg, contract, ticker_data in tickers_map.values():
        # Try live first, fall back to delayed
        bid = positive_number(ticker_data.bid)
        ask = positive_number(ticker_data.ask)
        last = positive_number(ticker_data.last)

        # Delayed data fields
        if bid is None and hasattr(ticker_data, 'delayedBid'):
            bid = positive_number(ticker_data.delayedBid)
        if ask is None and hasattr(ticker_data, 'delayedAsk'):
            ask = positive_number(ticker_data.delayedAsk)
        if last is None and hasattr(ticker_data, 'delayedLast'):
            last = positive_number(ticker_data.delayedLast)

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
        print("\n  UNAVAILABLE: market-data-unavailable-or-contract-unqualified")

    # Cancel market data
    for _, _, t in tickers_map.values():
        ib.cancelMktData(t.contract)

    ib.disconnect()
    return 0 if all_have_quotes else 2


if __name__ == "__main__":
    sys.exit(main())
