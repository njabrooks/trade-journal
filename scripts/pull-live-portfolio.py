#!/usr/bin/env python3
"""
Pull a LIVE portfolio snapshot via IBKR TWS API (IB Gateway on port 4001).

Returns current positions, market values, unrealized PnL and account summary
for every account the logged-in Gateway user can see. Unlike the Flex-backed
pull-portfolio.ts (EOD), this is intraday / real-time.

Usage:
  python3 scripts/pull-live-portfolio.py            # human-readable
  python3 scripts/pull-live-portfolio.py --json     # JSON output
  python3 scripts/pull-live-portfolio.py --account Uxxxxxxxx   # filter

Requires IB Gateway running and logged in. Uses radon's venv for ib_insync.
"""

import sys
import json
import argparse
from collections import defaultdict

sys.path.insert(0, "/Users/home-hub/projects/radon/.venv/lib/python3.14/site-packages")

from ib_insync import IB, util


def connect(ib: IB) -> None:
    try:
        ib.connect("127.0.0.1", 4001, clientId=96, timeout=10)
        return
    except ConnectionRefusedError:
        pass
    try:
        ib.connect("127.0.0.1", 7496, clientId=96, timeout=10)
    except ConnectionRefusedError:
        print("Could not connect to IB Gateway (4001) or TWS (7496). Is it running and logged in?", file=sys.stderr)
        sys.exit(1)


def fmt_money(x: float) -> str:
    if x is None:
        return "—"
    ax = abs(x)
    sign = "-" if x < 0 else ""
    if ax >= 1_000_000:
        return f"{sign}${ax/1_000_000:.2f}M"
    if ax >= 1_000:
        return f"{sign}${ax/1_000:.1f}K"
    return f"{sign}${ax:.0f}"


def describe_contract(c) -> str:
    """Short human description of an ib_insync Contract."""
    if c.secType == "OPT":
        return f"{c.symbol:<5} {c.lastTradeDateOrContractMonth} {c.strike}{c.right}"
    if c.secType == "FOP":
        return f"{c.symbol:<5} {c.lastTradeDateOrContractMonth} {c.strike}{c.right} (FOP)"
    if c.secType == "FUT":
        return f"{c.symbol:<5} {c.lastTradeDateOrContractMonth} (FUT)"
    if c.secType == "CASH":
        return f"{c.symbol}.{c.currency}"
    return f"{c.symbol} ({c.secType})"


def underlying_key(c) -> str:
    return c.symbol


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    parser.add_argument("--account", help="Filter to a specific account code")
    args = parser.parse_args()

    ib = IB()
    if not args.json:
        print("Connecting to IB Gateway...", file=sys.stderr)
    connect(ib)

    accounts = ib.managedAccounts()
    if args.account:
        accounts = [a for a in accounts if a == args.account]
    if not accounts:
        print("No accounts visible to this Gateway login.", file=sys.stderr)
        ib.disconnect()
        sys.exit(1)

    if not args.json:
        print(f"Accounts: {', '.join(accounts)}", file=sys.stderr)

    # Subscribe to account updates per account. reqAccountUpdates handles a
    # single account; for multi-account (FA/advisor) logins we'd use
    # reqAccountUpdatesMulti — fall back to that if direct subscribe fails.
    for acct in accounts:
        try:
            ib.reqAccountUpdates(True, acct)
        except Exception:
            try:
                ib.reqAccountUpdatesMulti(acct, "")
            except Exception as e:
                print(f"  warn: could not subscribe to {acct}: {e}", file=sys.stderr)

    # Give IB a moment to stream the initial snapshot
    ib.sleep(3)

    # Account summary values per account
    summaries = {a: {} for a in accounts}
    for av in ib.accountValues():
        if av.account in summaries and av.currency in ("USD", "BASE", ""):
            summaries[av.account][av.tag] = av.value

    # Portfolio items per account
    portfolio_items = [p for p in ib.portfolio() if p.account in accounts]

    # Shape results
    out_accounts = []
    total_nav = 0.0
    total_cash = 0.0
    total_gross = 0.0

    for acct in accounts:
        s = summaries[acct]
        nav = float(s.get("NetLiquidation", 0) or 0)
        cash = float(s.get("TotalCashValue", 0) or 0)
        gross = float(s.get("GrossPositionValue", 0) or 0)
        total_nav += nav
        total_cash += cash
        total_gross += gross
        out_accounts.append({
            "account": acct,
            "nav": nav,
            "cash": cash,
            "grossPositionValue": gross,
            "leverage": (gross / nav) if nav else 0,
            "buyingPower": float(s.get("BuyingPower", 0) or 0),
            "currency": s.get("Currency", "USD"),
        })

    positions = []
    for p in portfolio_items:
        positions.append({
            "account": p.account,
            "symbol": p.contract.symbol,
            "secType": p.contract.secType,
            "conId": p.contract.conId,
            "description": describe_contract(p.contract),
            "expiry": getattr(p.contract, "lastTradeDateOrContractMonth", "") or None,
            "strike": getattr(p.contract, "strike", 0) or None,
            "right": getattr(p.contract, "right", "") or None,
            "multiplier": p.contract.multiplier or None,
            "currency": p.contract.currency,
            "quantity": p.position,
            "avgCost": p.averageCost,
            "marketPrice": p.marketPrice,
            "marketValue": p.marketValue,
            "unrealizedPnl": p.unrealizedPNL,
            "realizedPnl": p.realizedPNL,
        })

    # Group positions by underlying
    by_symbol = defaultdict(lambda: {"positions": [], "marketValue": 0.0, "unrealizedPnl": 0.0})
    for p in positions:
        k = p["symbol"]
        by_symbol[k]["positions"].append(p)
        by_symbol[k]["marketValue"] += p["marketValue"] or 0
        by_symbol[k]["unrealizedPnl"] += p["unrealizedPnl"] or 0

    underlying_rows = sorted(
        [{"symbol": k, **v} for k, v in by_symbol.items()],
        key=lambda r: abs(r["marketValue"]),
        reverse=True,
    )

    result = {
        "snapshotAt": util.df([]).index.tz_localize(None).name if False else None,  # placeholder
        "accounts": out_accounts,
        "totals": {
            "nav": total_nav,
            "cash": total_cash,
            "grossPositionValue": total_gross,
            "leverage": (total_gross / total_nav) if total_nav else 0,
            "positionCount": len(positions),
        },
        "underlyings": underlying_rows,
        "positions": positions,
    }

    # Cleanup subscriptions
    for acct in accounts:
        try:
            ib.reqAccountUpdates(False, acct)
        except Exception:
            pass
    ib.disconnect()

    if args.json:
        print(json.dumps(result, default=str, indent=2))
        return

    # Human-readable
    t = result["totals"]
    print()
    print("═" * 72)
    print("  LIVE PORTFOLIO SNAPSHOT (IBKR Gateway)")
    print("═" * 72)
    print(f"  Accounts:   {', '.join(accounts)}")
    print(f"  NAV:        {fmt_money(t['nav'])}")
    print(f"  Cash:       {fmt_money(t['cash'])}")
    print(f"  Gross Exp:  {fmt_money(t['grossPositionValue'])}")
    print(f"  Leverage:   {t['leverage']:.2f}x")
    print(f"  Positions:  {t['positionCount']}")
    print("─" * 72)
    print()
    print("  ACCOUNT BREAKDOWN")
    print("  " + "─" * 58)
    print(f"  {'Account':<14} {'NAV':>12} {'Cash':>12} {'Gross':>12} {'Lev':>6}")
    for a in out_accounts:
        print(f"  {a['account']:<14} {fmt_money(a['nav']):>12} {fmt_money(a['cash']):>12} {fmt_money(a['grossPositionValue']):>12} {a['leverage']:>5.2f}x")
    print()

    print("  UNDERLYING BREAKDOWN")
    print("  " + "─" * 58)
    print(f"  {'Ticker':<10} {'Positions':>10} {'Market Value':>14} {'UnrPnL':>12}")
    for r in underlying_rows:
        pct = (r["marketValue"] / t["nav"] * 100) if t["nav"] else 0
        print(f"  {r['symbol']:<10} {len(r['positions']):>10} {fmt_money(r['marketValue']):>14} {fmt_money(r['unrealizedPnl']):>12}   {pct:>5.1f}%")
    print()

    print("  POSITIONS")
    print("  " + "─" * 58)
    print(f"  {'Account':<14} {'Contract':<34} {'Qty':>8} {'MV':>10} {'UnrPnL':>10}")
    for p in sorted(positions, key=lambda x: -abs(x["marketValue"] or 0)):
        qty = f"{p['quantity']:.0f}" if p["quantity"] == int(p["quantity"]) else f"{p['quantity']:.4f}"
        print(f"  {p['account']:<14} {p['description']:<34} {qty:>8} {fmt_money(p['marketValue']):>10} {fmt_money(p['unrealizedPnl']):>10}")
    print()


if __name__ == "__main__":
    main()
