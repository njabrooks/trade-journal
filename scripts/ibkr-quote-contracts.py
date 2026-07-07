"""
Quote a batch of option contracts via IB Gateway — machine-readable companion to
ibkr-option-quote.py (docs/v2/21: the "verify on IBKR" half of screen-on-Massive).

stdin:  JSON [{"ticker": "GLXY", "expiry": "20270115", "strike": 30, "right": "C"}, ...]
stdout: JSON [{...input, "bid", "ask", "last", "mid", "iv", "delta", "marketDataType"}, ...]
        marketDataType: 1=live 2=frozen 3=delayed 4=delayed-frozen

Usage: echo '[...]' | /Users/home-hub/projects/radon/.venv/bin/python3 scripts/ibkr-quote-contracts.py
"""
import json
import sys

sys.path.insert(0, "/Users/home-hub/projects/radon/.venv/lib/python3.14/site-packages")
from ib_insync import IB, Option  # noqa: E402

CLIENT_ID = 32  # trade-journal range 20-49
WAIT_SECS = 8


def main():
    contracts_in = json.loads(sys.stdin.read())
    ib = IB()
    ib.connect("127.0.0.1", 4001, clientId=CLIENT_ID, timeout=20)
    # Live by default (streaming bundle on the nick gateway profile, added 2026-07-06);
    # pass --delayed to force type 3 on an unentitled login. The returned
    # marketDataType field says which was actually served (1=live, 3=delayed).
    ib.reqMarketDataType(3 if "--delayed" in sys.argv else 1)

    out = []
    try:
        for c in contracts_in:
            opt = Option(
                c["ticker"], c["expiry"], float(c["strike"]), c["right"], "SMART", currency="USD"
            )
            try:
                qualified = ib.qualifyContracts(opt)
            except Exception as exc:  # unqualifiable — report and continue
                out.append({**c, "error": f"qualify: {exc}"})
                continue
            if not qualified:
                out.append({**c, "error": "not qualified"})
                continue
            tk = ib.reqMktData(opt, "106", False, False)  # 106 = option IV
            ib.sleep(WAIT_SECS)
            greeks = tk.modelGreeks
            bid = tk.bid if tk.bid and tk.bid > 0 else None
            ask = tk.ask if tk.ask and tk.ask > 0 else None
            out.append(
                {
                    **c,
                    "bid": bid,
                    "ask": ask,
                    "last": tk.last if tk.last and tk.last > 0 else None,
                    "mid": round((bid + ask) / 2, 4) if bid and ask else None,
                    "iv": round(greeks.impliedVol, 4) if greeks and greeks.impliedVol else None,
                    "delta": round(greeks.delta, 4) if greeks and greeks.delta else None,
                    "marketDataType": tk.marketDataType,
                }
            )
            ib.cancelMktData(opt)
    finally:
        ib.disconnect()

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
