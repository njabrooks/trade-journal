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

from lib.ibkr_option_quote_boundary import (  # noqa: E402
    BATCH_QUOTE_CLIENT_ID,
    positive_number,
    qualify_requested_option,
    unavailable_quote_row,
)

WAIT_SECS = 8


def quote_contracts(contracts_in, ib_factory, option_factory, delayed=False):
    """Quote requested contracts and return ``(rows, exit_code)``.

    Exit code 2 is the declared unavailable outcome when the gateway is absent
    or no requested contract has usable market data.
    """
    ib = ib_factory()
    try:
        ib.connect(
            "127.0.0.1",
            4001,
            clientId=BATCH_QUOTE_CLIENT_ID,
            timeout=20,
        )
    except Exception:
        return [unavailable_quote_row(c, "gateway-unavailable") for c in contracts_in], 2

    # Live by default (streaming bundle on the nick gateway profile, added 2026-07-06);
    # pass --delayed to force type 3 on an unentitled login. The returned
    # marketDataType field says which was actually served (1=live, 3=delayed).
    try:
        ib.reqMarketDataType(3 if delayed else 1)
    except Exception:
        ib.disconnect()
        return [unavailable_quote_row(c, "market-data-unavailable") for c in contracts_in], 2

    out = []
    try:
        for c in contracts_in:
            opt, unavailable_reason = qualify_requested_option(ib, c, option_factory)
            if opt is None:
                out.append(unavailable_quote_row(c, unavailable_reason))
                continue
            try:
                tk = ib.reqMktData(opt, "106", False, False)  # 106 = option IV
                ib.sleep(WAIT_SECS)
            except Exception:
                out.append(unavailable_quote_row(c, "market-data-unavailable"))
                continue
            greeks = tk.modelGreeks
            bid = positive_number(tk.bid)
            ask = positive_number(tk.ask)
            if bid is None or ask is None:
                row = unavailable_quote_row(c, "market-data-unavailable")
                row["last"] = positive_number(tk.last)
                row["marketDataType"] = getattr(tk, "marketDataType", None)
                out.append(row)
            else:
                out.append(
                    {
                        **c,
                        "status": "available",
                        "reason": None,
                        "bid": bid,
                        "ask": ask,
                        "last": positive_number(tk.last),
                        "mid": round((bid + ask) / 2, 4),
                        "iv": round(greeks.impliedVol, 4)
                        if greeks and positive_number(greeks.impliedVol)
                        else None,
                        "delta": round(greeks.delta, 4)
                        if greeks and isinstance(greeks.delta, (int, float))
                        else None,
                        "marketDataType": getattr(tk, "marketDataType", None),
                    }
                )
            ib.cancelMktData(opt)
    finally:
        ib.disconnect()

    return out, 0 if any(row["status"] == "available" for row in out) else 2


def main():
    sys.path.insert(0, "/Users/home-hub/projects/radon/.venv/lib/python3.14/site-packages")
    from ib_insync import IB, Option  # noqa: E402

    contracts_in = json.loads(sys.stdin.read())
    out, exit_code = quote_contracts(
        contracts_in,
        ib_factory=IB,
        option_factory=Option,
        delayed="--delayed" in sys.argv,
    )
    print(json.dumps(out, indent=2))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
