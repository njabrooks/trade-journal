#!/usr/bin/env python3
"""
OpenBB Company Data Fetcher → Obsidian Markdown

Fetches company financial data from OpenBB and formats it as markdown
for integration with Nick's Obsidian research vault.

Usage:
    source ~/openbb-env/bin/activate
    python scripts/openbb/fetch_company_data.py COIN
    python scripts/openbb/fetch_company_data.py COIN --output /path/to/vault
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from openbb import obb
import pandas as pd


# Default Obsidian vault path
DEFAULT_VAULT_PATH = "/Users/njb/Desktop/nick/investing"


def format_number(value: float, decimals: int = 2) -> str:
    """Format large numbers with B/M/K suffixes."""
    if pd.isna(value):
        return "N/A"
    if abs(value) >= 1e9:
        return f"${value/1e9:.{decimals}f}B"
    if abs(value) >= 1e6:
        return f"${value/1e6:.{decimals}f}M"
    if abs(value) >= 1e3:
        return f"${value/1e3:.{decimals}f}K"
    return f"${value:.{decimals}f}"


def format_percent(value: float) -> str:
    """Format as percentage."""
    if pd.isna(value):
        return "N/A"
    return f"{value:.2%}"


def fetch_profile(symbol: str) -> dict:
    """Fetch company profile from yfinance."""
    try:
        result = obb.equity.profile(symbol=symbol, provider="yfinance")
        df = result.to_df()
        if df.empty:
            return {}
        return df.iloc[0].to_dict()
    except Exception as e:
        print(f"Warning: Could not fetch profile: {e}")
        return {}


def fetch_income_statement(symbol: str, quarters: int = 4) -> pd.DataFrame:
    """Fetch income statement data."""
    try:
        result = obb.equity.fundamental.income(
            symbol=symbol, period="quarter", limit=quarters, provider="yfinance"
        )
        return result.to_df()
    except Exception as e:
        print(f"Warning: Could not fetch income statement: {e}")
        return pd.DataFrame()


def fetch_balance_sheet(symbol: str, quarters: int = 2) -> pd.DataFrame:
    """Fetch balance sheet data."""
    try:
        result = obb.equity.fundamental.balance(
            symbol=symbol, period="quarter", limit=quarters, provider="yfinance"
        )
        return result.to_df()
    except Exception as e:
        print(f"Warning: Could not fetch balance sheet: {e}")
        return pd.DataFrame()


def fetch_cash_flow(symbol: str, quarters: int = 4) -> pd.DataFrame:
    """Fetch cash flow statement data."""
    try:
        result = obb.equity.fundamental.cash(
            symbol=symbol, period="quarter", limit=quarters, provider="yfinance"
        )
        return result.to_df()
    except Exception as e:
        print(f"Warning: Could not fetch cash flow: {e}")
        return pd.DataFrame()


def fetch_key_metrics(symbol: str) -> dict:
    """Fetch key valuation metrics."""
    try:
        result = obb.equity.fundamental.metrics(
            symbol=symbol, period="quarter", limit=1, provider="yfinance"
        )
        df = result.to_df()
        if df.empty:
            return {}
        return df.iloc[0].to_dict()
    except Exception as e:
        print(f"Warning: Could not fetch metrics: {e}")
        return {}


def fetch_price_history(symbol: str, days: int = 30) -> pd.DataFrame:
    """Fetch recent price history."""
    try:
        from datetime import timedelta
        start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        result = obb.equity.price.historical(
            symbol=symbol, start_date=start, provider="yfinance"
        )
        return result.to_df()
    except Exception as e:
        print(f"Warning: Could not fetch price history: {e}")
        return pd.DataFrame()


def fetch_sec_filings(symbol: str, limit: int = 10) -> pd.DataFrame:
    """Fetch recent SEC filings."""
    try:
        result = obb.equity.fundamental.filings(
            symbol=symbol, limit=limit, provider="sec"
        )
        return result.to_df()
    except Exception as e:
        print(f"Warning: Could not fetch SEC filings: {e}")
        return pd.DataFrame()


def fetch_revenue_segments(symbol: str) -> pd.DataFrame:
    """Fetch revenue by segment (requires FMP API key)."""
    try:
        # Check for FMP API key
        import os
        api_key = os.environ.get("FMP_API_KEY") or os.environ.get("FMP_API")
        if api_key:
            obb.user.credentials.fmp_api_key = api_key

        result = obb.equity.fundamental.revenue_per_segment(
            symbol=symbol, provider="fmp"
        )
        return result.to_df()
    except Exception as e:
        # Silently fail if no API key or endpoint not available
        return pd.DataFrame()


def generate_markdown(
    symbol: str,
    profile: dict,
    income_df: pd.DataFrame,
    balance_df: pd.DataFrame,
    cash_df: pd.DataFrame,
    metrics: dict,
    price_df: pd.DataFrame,
    filings_df: pd.DataFrame,
    segments_df: pd.DataFrame = None,
) -> str:
    """Generate markdown document from fetched data."""

    today = datetime.now().strftime("%Y-%m-%d")
    company_name = profile.get("name", symbol)
    sector = profile.get("sector", "Unknown")
    industry = profile.get("industry_category", "Unknown")
    description = profile.get("long_description", "No description available.")
    website = profile.get("company_url", "")
    employees = profile.get("employees", "N/A")

    # Current price from most recent history
    current_price = "N/A"
    price_change_30d = "N/A"
    if not price_df.empty:
        current_price = f"${price_df.iloc[-1]['close']:.2f}"
        if len(price_df) > 1:
            start_price = price_df.iloc[0]['close']
            end_price = price_df.iloc[-1]['close']
            change = (end_price - start_price) / start_price
            price_change_30d = f"{change:+.1%}"

    # Key metrics
    market_cap = format_number(metrics.get("market_cap", 0))
    pe_ratio = f"{metrics.get('pe_ratio', 'N/A'):.1f}" if metrics.get('pe_ratio') else "N/A"
    forward_pe = f"{metrics.get('forward_pe', 'N/A'):.1f}" if metrics.get('forward_pe') else "N/A"
    price_to_book = f"{metrics.get('price_to_book', 'N/A'):.2f}" if metrics.get('price_to_book') else "N/A"
    enterprise_value = format_number(metrics.get("enterprise_value", 0))
    beta = f"{profile.get('beta', 'N/A'):.2f}" if profile.get('beta') else "N/A"

    # Build markdown
    md = f"""---
id:
type: company_financials
created_at: {today}
updated_at: {today}
ticker: {symbol}
company_name: {company_name}
sector: {sector}
industry: {industry}
source: openbb
data_provider: yfinance
tags:
  - financials
  - {symbol.lower()}
  - openbb
status: current
---

# {company_name} ({symbol}) - Financial Overview

**Generated**: {datetime.now().strftime("%Y-%m-%d %H:%M")}
**Source**: OpenBB (yfinance provider)

---

## Company Profile

| Metric | Value |
|--------|-------|
| **Sector** | {sector} |
| **Industry** | {industry} |
| **Employees** | {employees:,} |
| **Website** | [{website}]({website}) |

### Description
{description[:500]}{"..." if len(description) > 500 else ""}

---

## Key Metrics

| Metric | Value |
|--------|-------|
| **Current Price** | {current_price} |
| **30-Day Change** | {price_change_30d} |
| **Market Cap** | {market_cap} |
| **Enterprise Value** | {enterprise_value} |
| **P/E Ratio** | {pe_ratio} |
| **Forward P/E** | {forward_pe} |
| **Price/Book** | {price_to_book} |
| **Beta** | {beta} |

---

## Income Statement (Last 4 Quarters)

"""

    # Income statement table
    if not income_df.empty:
        md += "| Quarter | Revenue | Gross Profit | Operating Income | Net Income |\n"
        md += "|---------|---------|--------------|------------------|------------|\n"
        for _, row in income_df.iterrows():
            period = row.get('period_ending', 'N/A')
            if hasattr(period, 'month'):
                # Convert month to quarter
                q = (period.month - 1) // 3 + 1
                quarter = f"{period.year}-Q{q}"
            else:
                quarter = str(period)[:10]
            revenue = format_number(row.get('total_revenue', 0))
            gross = format_number(row.get('gross_profit', 0))
            operating = format_number(row.get('operating_income', 0))
            net = format_number(row.get('net_income', 0))
            md += f"| {quarter} | {revenue} | {gross} | {operating} | {net} |\n"
    else:
        md += "_No income statement data available_\n"

    md += "\n---\n\n## Balance Sheet (Latest Quarter)\n\n"

    # Balance sheet
    if not balance_df.empty:
        latest = balance_df.iloc[0]
        assets = format_number(latest.get('total_assets', 0))
        liabilities = format_number(latest.get('total_liabilities_net_minority_interest', 0))
        cash = format_number(latest.get('cash_and_cash_equivalents', 0))

        md += f"""| Metric | Value |
|--------|-------|
| **Total Assets** | {assets} |
| **Total Liabilities** | {liabilities} |
| **Cash & Equivalents** | {cash} |

"""
    else:
        md += "_No balance sheet data available_\n\n"

    md += "---\n\n## Cash Flow (Last 4 Quarters)\n\n"

    # Cash flow table
    if not cash_df.empty:
        md += "| Quarter | Operating CF | Investing CF | Financing CF | Free CF |\n"
        md += "|---------|--------------|--------------|--------------|----------|\n"
        for _, row in cash_df.iterrows():
            quarter = str(row.get('period_ending', 'N/A'))[:10]
            operating = format_number(row.get('operating_cash_flow', 0))
            investing = format_number(row.get('investing_cash_flow', 0))
            financing = format_number(row.get('financing_cash_flow', 0))
            free_cf = format_number(row.get('free_cash_flow', 0))
            md += f"| {quarter} | {operating} | {investing} | {financing} | {free_cf} |\n"
    else:
        md += "_No cash flow data available_\n"

    # Revenue segments (if available via FMP)
    if segments_df is not None and not segments_df.empty:
        md += "\n---\n\n## Revenue by Segment\n\n"
        # Get most recent year's data
        if 'fiscal_year' in segments_df.columns:
            latest_year = segments_df['fiscal_year'].max()
            latest_segments = segments_df[segments_df['fiscal_year'] == latest_year]
        else:
            latest_segments = segments_df.head(10)

        md += f"_FY {latest_year if 'fiscal_year' in segments_df.columns else 'Latest'}_\n\n"
        md += "| Segment | Revenue |\n"
        md += "|---------|--------|\n"
        for _, row in latest_segments.iterrows():
            segment = row.get('business_line', row.get('segment', 'Unknown'))
            # Truncate long segment names
            if len(str(segment)) > 50:
                segment = str(segment)[:47] + "..."
            revenue = format_number(row.get('revenue', 0))
            md += f"| {segment} | {revenue} |\n"

    md += "\n---\n\n## Recent SEC Filings\n\n"

    # SEC filings
    if not filings_df.empty:
        md += "| Date | Type | Description |\n"
        md += "|------|------|-------------|\n"
        for _, row in filings_df.head(10).iterrows():
            date = str(row.get('filing_date', 'N/A'))[:10]
            filing_type = row.get('report_type', 'N/A')
            desc = row.get('primary_doc_description', '')[:50] or filing_type
            url = row.get('report_url', '#')
            md += f"| {date} | [{filing_type}]({url}) | {desc} |\n"
    else:
        md += "_No SEC filings data available_\n"

    md += f"""

---

## Notes

_Add your analysis and notes here_

---

## Related Research

_Link to related transcripts, audits, and claims_

---

**Data Refresh**: To update this file, run:
```bash
source ~/openbb-env/bin/activate
python scripts/openbb/fetch_company_data.py {symbol}
```
"""

    return md


def main():
    parser = argparse.ArgumentParser(
        description="Fetch company financial data from OpenBB and save as markdown"
    )
    parser.add_argument("symbol", help="Stock ticker symbol (e.g., COIN, AAPL)")
    parser.add_argument(
        "--output", "-o",
        default=DEFAULT_VAULT_PATH,
        help=f"Output directory (default: {DEFAULT_VAULT_PATH})"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print to stdout instead of saving to file"
    )

    args = parser.parse_args()
    symbol = args.symbol.upper()

    print(f"Fetching data for {symbol}...")

    # Fetch all data
    print("  - Company profile...")
    profile = fetch_profile(symbol)

    print("  - Income statement...")
    income_df = fetch_income_statement(symbol)

    print("  - Balance sheet...")
    balance_df = fetch_balance_sheet(symbol)

    print("  - Cash flow...")
    cash_df = fetch_cash_flow(symbol)

    print("  - Key metrics...")
    metrics = fetch_key_metrics(symbol)

    print("  - Price history...")
    price_df = fetch_price_history(symbol)

    print("  - SEC filings...")
    filings_df = fetch_sec_filings(symbol)

    print("  - Revenue segments (FMP)...")
    segments_df = fetch_revenue_segments(symbol)

    # Generate markdown
    print("Generating markdown...")
    markdown = generate_markdown(
        symbol, profile, income_df, balance_df, cash_df,
        metrics, price_df, filings_df, segments_df
    )

    if args.dry_run:
        print("\n" + "="*60)
        print(markdown)
        print("="*60)
    else:
        # Save to file
        today = datetime.now().strftime("%Y-%m-%d")
        filename = f"{today}-{symbol}-financials.md"
        output_path = Path(args.output) / filename

        output_path.write_text(markdown)
        print(f"\nSaved to: {output_path}")

    print("Done!")


if __name__ == "__main__":
    main()
