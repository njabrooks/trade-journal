#!/usr/bin/env python3
"""
Manual IBKR options-chain ingest for the cheap-options scanner radar.

Reuses Radon's IBClient (sys.path injection) — see reference_radon_ibkr.md.
Pulls the same monthly-expiry universe as ingest-radar-back-months.ts (1M–9M
3rd-Friday expiries, ±20% strikes around spot), qualifies all option contracts
via ib_insync, requests market-data snapshots with model greeks, and upserts
into options_chain_snapshots with source='ibkr'.

When run after Massive has populated the same date for the same tickers, the
two sources coexist in the same table (unique key includes source). The
scanner prefers IBKR rows when present.

Prerequisites
-------------
  - IB Gateway or TWS running and logged in (port 4001 live, 4002 paper, 7496/7497 TWS)
  - 2FA approved (usually only required Mon morning if Radon's IBC is managing)
  - Run from trade-journal directory
  - DATABASE_URL_POOLER and MASSIVE_API_KEY in .env.local (Massive is used for spot fallback)

Usage
-----
    python3 scripts/ingest-ibkr-chains.py                        # all active watchlist tickers
    python3 scripts/ingest-ibkr-chains.py --dry-run              # preflight + plan, no fetches
    python3 scripts/ingest-ibkr-chains.py NVDA TSLA META         # specific tickers
    python3 scripts/ingest-ibkr-chains.py --port 7497            # TWS paper instead of Gateway live
    python3 scripts/ingest-ibkr-chains.py --strike-pct 0.10      # narrower ±10% strike window
    python3 scripts/ingest-ibkr-chains.py --months 1 3 6         # only 1M, 3M, 6M expiries

Connection: client_id 25 (Radon CLAUDE.md reserves 0-19; subprocess scripts use 20-49).
"""

import argparse
import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

# ---- Inject Radon's venv + IBClient module path ----
RADON_ROOT = Path("/Users/home-hub/projects/radon")
RADON_VENV = RADON_ROOT / ".venv" / "lib" / "python3.14" / "site-packages"
sys.path.insert(0, str(RADON_VENV))
sys.path.insert(0, str(RADON_ROOT))

try:
    from ib_insync import Stock, Option, Future, ContFuture, util  # noqa: E402
except ImportError as e:
    print(f"ERROR: ib_insync not available at {RADON_VENV}: {e}")
    sys.exit(1)

try:
    from scripts.clients.ib_client import IBClient  # noqa: E402
except ImportError as e:
    print(f"ERROR: Radon IBClient not importable from {RADON_ROOT}: {e}")
    sys.exit(1)


# ---- Config ----
DEFAULT_PORT = 4001
DEFAULT_CLIENT_ID = 25
DEFAULT_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
DEFAULT_STRIKE_PCT = 0.20
DEFAULT_BATCH_SIZE = 50  # market-data requests per batch


# ---- DB helpers (use psql to keep dependencies minimal) ----
TJ_ROOT = Path(__file__).resolve().parent.parent
PSQL = "/opt/homebrew/opt/postgresql@16/bin/psql"


def get_database_url() -> str:
    env_path = TJ_ROOT / ".env.local"
    if not env_path.exists():
        raise RuntimeError(f"Missing .env.local at {env_path}")
    for line in env_path.read_text().splitlines():
        if line.startswith("DATABASE_URL_POOLER="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("DATABASE_URL_POOLER not found in .env.local")


def psql_query(sql: str) -> list[list[str]]:
    """Run a SQL SELECT and return rows as list of cell-string lists. Tab-separated."""
    db_url = get_database_url()
    result = subprocess.run(
        [PSQL, db_url, "-A", "-t", "-F", "\t", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    )
    return [
        line.split("\t") for line in result.stdout.strip().split("\n") if line.strip()
    ]


def psql_exec(sql: str, params: Optional[list] = None) -> None:
    """Run a SQL statement. Params list is interpolated as $1, $2, ... using -v psql vars.
    For simplicity we substitute via Python here — caller must escape strings."""
    db_url = get_database_url()
    subprocess.run(
        [PSQL, db_url, "-q", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    )


# ---- Watchlist resolution ----
def get_radar_tickers(filter_tickers: Optional[list[str]] = None) -> list[dict]:
    """Return active watchlist entries with metadata: ticker, underlying_id, asset_class."""
    if filter_tickers:
        ticker_list = ",".join(f"'{t.upper()}'" for t in filter_tickers)
        where_clause = f"AND UPPER(u.ticker) IN ({ticker_list})"
    else:
        where_clause = ""
    sql = f"""
        SELECT u.ticker, u.id, COALESCE(u.asset_class, '')
        FROM watchlist_entries we
        JOIN underlyings u ON u.id = we.underlying_id
        WHERE we.is_active = true
          {where_clause}
        ORDER BY u.ticker;
    """
    rows = psql_query(sql)
    return [
        {"ticker": r[0], "underlying_id": r[1], "asset_class": r[2]}
        for r in rows
    ]


def get_latest_spot(ticker: str) -> Optional[float]:
    sql = f"""
        SELECT spot FROM underlyings_iv_history
        WHERE UPPER(ticker) = '{ticker.upper()}'
          AND spot IS NOT NULL
        ORDER BY as_of_date DESC LIMIT 1;
    """
    rows = psql_query(sql)
    if not rows or not rows[0][0]:
        return None
    try:
        return float(rows[0][0])
    except ValueError:
        return None


# ---- Expiry / contract helpers ----
def third_friday(year: int, month: int) -> datetime:
    first = datetime(year, month, 1, tzinfo=timezone.utc)
    weekday = first.weekday()  # 0=Mon, 4=Fri
    offset_to_first_fri = (4 - weekday + 7) % 7
    day = 1 + offset_to_first_fri + 14
    return datetime(year, month, day, tzinfo=timezone.utc)


def monthly_expiries(months_ahead: list[int]) -> list[str]:
    """Return YYYYMMDD strings for the 3rd Friday N months ahead."""
    out = []
    today = datetime.now(timezone.utc)
    base_year, base_month = today.year, today.month
    if third_friday(base_year, base_month).date() <= today.date():
        # current month's monthly already passed → start next month
        base_month += 1
        if base_month > 12:
            base_month = 1
            base_year += 1
    for n in months_ahead:
        m = base_month + (n - 1)
        y = base_year + (m - 1) // 12
        m_norm = ((m - 1) % 12) + 1
        out.append(third_friday(y, m_norm).strftime("%Y%m%d"))
    return out


# Common futures roots known to use ContFuture in IBKR
FUTURES_ROOTS = {"ES", "NQ", "YM", "RTY", "MNQ", "MES", "MYM", "M2K",
                 "CL", "NG", "GC", "SI", "HG", "PL", "PA",
                 "ZC", "ZS", "ZW", "ZM", "ZL", "ZB", "ZN", "ZF", "ZT",
                 "6E", "6B", "6J", "6A", "6C", "6S", "6N",
                 "VX", "BTC", "ETH"}


def resolve_underlying(symbol: str, asset_class: str):
    """Return an ib_insync contract (Stock or ContFuture) for the underlying."""
    sym = symbol.upper()
    # Detect specific futures expiry suffix (e.g., CLM6, ZCZ6) — single char month + digit year
    has_specific_suffix = (
        len(sym) > 2
        and sym[:-2] in FUTURES_ROOTS
        and sym[-2] in "FGHJKMNQUVXZ"
        and sym[-1].isdigit()
    )
    if has_specific_suffix:
        root = sym[:-2]
        return Future(symbol=root, lastTradeDateOrContractMonth=sym[-2:], exchange="")
    if sym in FUTURES_ROOTS or asset_class.upper() == "FUT":
        return ContFuture(symbol=sym, exchange="")
    return Stock(symbol=sym, exchange="SMART", currency="USD")


def filter_strikes(strikes: list[float], spot: float, pct: float) -> list[float]:
    lo = spot * (1 - pct)
    hi = spot * (1 + pct)
    return sorted([s for s in strikes if lo <= s <= hi])


# ---- Upsert ----
def upsert_chain_snapshot(rows: list[dict], snapshot_date: str) -> None:
    """Bulk upsert option contracts into options_chain_snapshots with source='ibkr'.
    rows: list of {ticker, underlying_id, contract_type, strike, expiration_date,
                   dte, iv, bid, ask, last, volume, open_interest, delta, gamma, theta, vega, spot}
    """
    if not rows:
        return
    db_url = get_database_url()
    # Build VALUES clause; chunked for psql arg-length safety
    chunk_size = 200

    def fmt(v):
        if v is None or v == "":
            return "NULL"
        return str(v) if isinstance(v, (int, float)) else f"'{str(v).replace(chr(39), chr(39)*2)}'"

    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        values = ",".join(
            "({uid},{tic},{date},{spot},'ibkr',{ct},{strike},{exp},{dte},"
            "{iv},{bid},{ask},{last},{vol},{oi},{delta},{gamma},{theta},{vega},NOW(),NOW())".format(
                uid=fmt(r["underlying_id"]),
                tic=fmt(r["ticker"]),
                date=fmt(snapshot_date),
                spot=fmt(r["spot"]),
                ct=fmt(r["contract_type"]),
                strike=fmt(r["strike"]),
                exp=fmt(r["expiration_date"]),
                dte=fmt(r["dte"]),
                iv=fmt(r["iv"]),
                bid=fmt(r["bid"]),
                ask=fmt(r["ask"]),
                last=fmt(r["last"]),
                vol=fmt(r["volume"]),
                oi=fmt(r["open_interest"]),
                delta=fmt(r["delta"]),
                gamma=fmt(r["gamma"]),
                theta=fmt(r["theta"]),
                vega=fmt(r["vega"]),
            )
            for r in chunk
        )
        sql = f"""
            INSERT INTO options_chain_snapshots
                (underlying_id, ticker, snapshot_date, underlying_spot, source,
                 contract_type, strike, expiration_date, dte,
                 implied_volatility, bid, ask, last, volume, open_interest,
                 delta, gamma, theta, vega, created_at, updated_at)
            VALUES {values}
            ON CONFLICT (ticker, snapshot_date, contract_type, strike, expiration_date, source)
            DO UPDATE SET
                implied_volatility = EXCLUDED.implied_volatility,
                bid = EXCLUDED.bid, ask = EXCLUDED.ask, last = EXCLUDED.last,
                volume = EXCLUDED.volume, open_interest = EXCLUDED.open_interest,
                delta = EXCLUDED.delta, gamma = EXCLUDED.gamma,
                theta = EXCLUDED.theta, vega = EXCLUDED.vega,
                underlying_spot = EXCLUDED.underlying_spot,
                updated_at = NOW();
        """
        subprocess.run(
            [PSQL, db_url, "-q", "-c", sql],
            capture_output=True,
            text=True,
            check=True,
        )


def calc_dte(expiry_yyyymmdd: str, snapshot_date: str) -> int:
    exp = datetime.strptime(expiry_yyyymmdd, "%Y%m%d")
    snap = datetime.strptime(snapshot_date, "%Y-%m-%d")
    return (exp - snap).days


def gateway_listening(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=3):
            return True
    except OSError:
        return False


# ---- Main ----
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tickers", nargs="*", help="Specific tickers to pull (default: full active watchlist)")
    parser.add_argument("--dry-run", action="store_true", help="Preflight + plan only, no IBKR fetches")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"IB port (default {DEFAULT_PORT})")
    parser.add_argument("--client-id", type=int, default=DEFAULT_CLIENT_ID, help=f"IB client_id (default {DEFAULT_CLIENT_ID})")
    parser.add_argument("--host", type=str, default="127.0.0.1")
    parser.add_argument("--months", type=int, nargs="+", default=DEFAULT_MONTHS, help="Months ahead to pull")
    parser.add_argument("--strike-pct", type=float, default=DEFAULT_STRIKE_PCT, help="Strike window ± pct of spot (default 0.20)")
    parser.add_argument("--delayed", action="store_true", help="Force delayed quotes (type 3) instead of live")
    args = parser.parse_args()

    snapshot_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    expiries = monthly_expiries(args.months)
    print(f"\n[IBKR] Snapshot date: {snapshot_date}")
    print(f"[IBKR] Expiries ({len(expiries)}): {', '.join(expiries)}")
    print(f"[IBKR] Strike window: ±{args.strike_pct*100:.0f}% of spot")

    radar = get_radar_tickers(args.tickers if args.tickers else None)
    print(f"[IBKR] Active watchlist: {len(radar)} tickers")

    if args.dry_run:
        print(f"\n[IBKR] --dry-run: preflight only.")
        print(f"[IBKR] Would connect to {args.host}:{args.port} as client_id={args.client_id}")
        listening = gateway_listening(args.host, args.port)
        print(f"[IBKR] Gateway port {args.port} listening: {listening}")
        if not listening:
            print(f"[IBKR] HINT: Start IB Gateway / TWS and log in before running without --dry-run.")
        sys.exit(0)

    if not radar:
        print(f"[IBKR] Watchlist empty, nothing to do.")
        sys.exit(0)

    if not gateway_listening(args.host, args.port):
        print(f"\n❌ IB Gateway not listening on {args.host}:{args.port}.")
        print(f"   Start IB Gateway or TWS, log in (2FA if cold start), then re-run.")
        sys.exit(1)

    client = IBClient()
    try:
        client.connect(host=args.host, port=args.port, client_id=args.client_id)
        ib = client.ib
        # Live by default (streaming bundle on the nick gateway profile, added 2026-07-06);
        # --delayed forces type 3 for sessions on an unentitled login
        ib.reqMarketDataType(3 if args.delayed else 1)
        print(f"[IBKR] Connected to {args.host}:{args.port} as client_id={args.client_id}")
    except Exception as e:
        print(f"\n❌ IBKR connect failed: {e}")
        sys.exit(1)

    total_inserted = 0
    ticker_errors = 0

    try:
        for entry in radar:
            ticker = entry["ticker"]
            underlying_id = entry["underlying_id"]
            asset_class = entry["asset_class"]
            try:
                spot = get_latest_spot(ticker)
                if not spot:
                    print(f"  {ticker:<8} no recent spot in DB, skipping")
                    continue

                underlying = resolve_underlying(ticker, asset_class)
                qualified = ib.qualifyContracts(underlying)
                if not qualified or not qualified[0].conId:
                    print(f"  {ticker:<8} could not qualify underlying, skipping")
                    ticker_errors += 1
                    continue
                und = qualified[0]

                sec_type = "STK" if isinstance(underlying, Stock) else "FUT"
                chain_params = ib.reqSecDefOptParams(
                    und.symbol, "", sec_type, und.conId
                )
                if not chain_params:
                    print(f"  {ticker:<8} no chain params returned, skipping")
                    continue
                # Choose the SMART/most-liquid chain (or first available)
                chain = next((c for c in chain_params if c.exchange == "SMART"), chain_params[0])

                strikes = filter_strikes(chain.strikes, spot, args.strike_pct)
                if not strikes:
                    print(f"  {ticker:<8} no strikes in window ±{args.strike_pct*100:.0f}%, skipping")
                    continue

                # Build option contracts: every (expiry, strike, right=C/P) combo
                contracts = []
                for exp in expiries:
                    if exp not in chain.expirations:
                        continue
                    for k in strikes:
                        for right in ("C", "P"):
                            contracts.append(Option(
                                symbol=und.symbol,
                                lastTradeDateOrContractMonth=exp,
                                strike=k,
                                right=right,
                                exchange=chain.exchange,
                                tradingClass=chain.tradingClass,
                                multiplier=chain.multiplier,
                                currency=und.currency,
                            ))

                if not contracts:
                    print(f"  {ticker:<8} no contracts after filtering, skipping")
                    continue

                # Qualify in batches (ib_insync handles internally but be explicit)
                qualified_opts = ib.qualifyContracts(*contracts)
                qualified_opts = [c for c in qualified_opts if c.conId]
                print(f"  {ticker:<8} spot={spot:.2f} qualified {len(qualified_opts)}/{len(contracts)} contracts across {len([e for e in expiries if e in chain.expirations])} expiries")

                # Request snapshots in batches
                rows = []
                for batch_start in range(0, len(qualified_opts), DEFAULT_BATCH_SIZE):
                    batch = qualified_opts[batch_start : batch_start + DEFAULT_BATCH_SIZE]
                    tickers_md = [ib.reqMktData(c, "", False, False) for c in batch]
                    ib.sleep(2.5)  # let snapshots arrive

                    for c, md in zip(batch, tickers_md):
                        exp_iso = f"{c.lastTradeDateOrContractMonth[:4]}-{c.lastTradeDateOrContractMonth[4:6]}-{c.lastTradeDateOrContractMonth[6:8]}"
                        dte = calc_dte(c.lastTradeDateOrContractMonth, snapshot_date)
                        # Greeks via modelGreeks (computed by IB)
                        mg = md.modelGreeks
                        rows.append({
                            "ticker": ticker.upper(),
                            "underlying_id": underlying_id,
                            "contract_type": "call" if c.right == "C" else "put",
                            "strike": c.strike,
                            "expiration_date": exp_iso,
                            "dte": dte,
                            "iv": mg.impliedVol if mg and mg.impliedVol else None,
                            "bid": md.bid if md.bid and md.bid > 0 else None,
                            "ask": md.ask if md.ask and md.ask > 0 else None,
                            "last": md.last if md.last and md.last > 0 else None,
                            "volume": int(md.volume) if md.volume and md.volume > 0 else None,
                            "open_interest": int(md.callOpenInterest) if c.right == "C" and md.callOpenInterest else (int(md.putOpenInterest) if c.right == "P" and md.putOpenInterest else None),
                            "delta": mg.delta if mg else None,
                            "gamma": mg.gamma if mg else None,
                            "theta": mg.theta if mg else None,
                            "vega": mg.vega if mg else None,
                            "spot": spot,
                        })

                    # Cancel subscriptions to free conn slots
                    for c in batch:
                        try:
                            ib.cancelMktData(c)
                        except Exception:
                            pass

                upsert_chain_snapshot(rows, snapshot_date)
                total_inserted += len(rows)
                print(f"  {ticker:<8} ✅ {len(rows)} contracts written")
                time.sleep(0.5)
            except Exception as e:
                ticker_errors += 1
                print(f"  {ticker:<8} ❌ {e}")
    finally:
        try:
            client.disconnect()
        except Exception:
            pass

    print(f"\n[IBKR] ✅ Done. Wrote {total_inserted} contracts across {len(radar) - ticker_errors} tickers ({ticker_errors} errors).")


if __name__ == "__main__":
    main()
