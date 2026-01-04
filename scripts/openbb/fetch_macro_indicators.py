#!/usr/bin/env python3
"""
OpenBB FRED Macro Indicators Fetcher → Obsidian Markdown

Fetches key economic indicators from FRED (Federal Reserve Economic Data)
and formats them as markdown for integration with the research vault.

Usage:
    source ~/openbb-env/bin/activate
    python scripts/openbb/fetch_macro_indicators.py
    python scripts/openbb/fetch_macro_indicators.py --output /path/to/vault
    python scripts/openbb/fetch_macro_indicators.py --series GDP,UNRATE,CPIAUCSL
"""

import argparse
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

from openbb import obb
import pandas as pd


# Default Obsidian vault path
DEFAULT_VAULT_PATH = "/Users/njb/Desktop/nick/investing"

# Key FRED series for thesis monitoring
# Organized by category for easy reference
FRED_SERIES = {
    # Growth & Output
    "GDP": {
        "name": "Real GDP",
        "description": "Real Gross Domestic Product (Quarterly, Seasonally Adjusted)",
        "category": "Growth",
        "frequency": "Quarterly",
    },
    "GDPC1": {
        "name": "Real GDP (Chained)",
        "description": "Real Gross Domestic Product (Chained 2017 Dollars)",
        "category": "Growth",
        "frequency": "Quarterly",
    },
    "INDPRO": {
        "name": "Industrial Production",
        "description": "Industrial Production Index",
        "category": "Growth",
        "frequency": "Monthly",
    },

    # Labor Market
    "UNRATE": {
        "name": "Unemployment Rate",
        "description": "Civilian Unemployment Rate",
        "category": "Labor",
        "frequency": "Monthly",
    },
    "PAYEMS": {
        "name": "Nonfarm Payrolls",
        "description": "All Employees, Total Nonfarm",
        "category": "Labor",
        "frequency": "Monthly",
    },
    "ICSA": {
        "name": "Initial Claims",
        "description": "Initial Claims for Unemployment Insurance",
        "category": "Labor",
        "frequency": "Weekly",
    },
    "JTSJOL": {
        "name": "Job Openings",
        "description": "Job Openings: Total Nonfarm (JOLTS)",
        "category": "Labor",
        "frequency": "Monthly",
    },

    # Inflation
    "CPIAUCSL": {
        "name": "CPI (All Items)",
        "description": "Consumer Price Index for All Urban Consumers",
        "category": "Inflation",
        "frequency": "Monthly",
    },
    "CPILFESL": {
        "name": "Core CPI",
        "description": "CPI Less Food and Energy",
        "category": "Inflation",
        "frequency": "Monthly",
    },
    "PCEPI": {
        "name": "PCE",
        "description": "Personal Consumption Expenditures Price Index",
        "category": "Inflation",
        "frequency": "Monthly",
    },
    "PCEPILFE": {
        "name": "Core PCE",
        "description": "Personal Consumption Expenditures Excluding Food and Energy",
        "category": "Inflation",
        "frequency": "Monthly",
    },
    "T5YIE": {
        "name": "5Y Breakeven Inflation",
        "description": "5-Year Breakeven Inflation Rate",
        "category": "Inflation",
        "frequency": "Daily",
    },
    "T10YIE": {
        "name": "10Y Breakeven Inflation",
        "description": "10-Year Breakeven Inflation Rate",
        "category": "Inflation",
        "frequency": "Daily",
    },

    # Interest Rates
    "FEDFUNDS": {
        "name": "Fed Funds Rate",
        "description": "Effective Federal Funds Rate",
        "category": "Rates",
        "frequency": "Daily",
    },
    "DFF": {
        "name": "Fed Funds (Daily)",
        "description": "Federal Funds Effective Rate (Daily)",
        "category": "Rates",
        "frequency": "Daily",
    },
    "DGS2": {
        "name": "2Y Treasury",
        "description": "2-Year Treasury Constant Maturity Rate",
        "category": "Rates",
        "frequency": "Daily",
    },
    "DGS10": {
        "name": "10Y Treasury",
        "description": "10-Year Treasury Constant Maturity Rate",
        "category": "Rates",
        "frequency": "Daily",
    },
    "DGS30": {
        "name": "30Y Treasury",
        "description": "30-Year Treasury Constant Maturity Rate",
        "category": "Rates",
        "frequency": "Daily",
    },
    "T10Y2Y": {
        "name": "10Y-2Y Spread",
        "description": "10-Year Treasury Constant Maturity Minus 2-Year (Yield Curve)",
        "category": "Rates",
        "frequency": "Daily",
    },
    "T10Y3M": {
        "name": "10Y-3M Spread",
        "description": "10-Year Treasury Constant Maturity Minus 3-Month (Yield Curve)",
        "category": "Rates",
        "frequency": "Daily",
    },

    # Credit & Financial Conditions
    "BAMLH0A0HYM2": {
        "name": "HY OAS",
        "description": "ICE BofA US High Yield Option-Adjusted Spread",
        "category": "Credit",
        "frequency": "Daily",
    },
    "BAMLC0A4CBBB": {
        "name": "BBB OAS",
        "description": "ICE BofA BBB US Corporate Index Option-Adjusted Spread",
        "category": "Credit",
        "frequency": "Daily",
    },
    "DRTSCILM": {
        "name": "C&I Loan Standards",
        "description": "Net % of Domestic Banks Tightening Standards for C&I Loans",
        "category": "Credit",
        "frequency": "Quarterly",
    },

    # Housing
    "HOUST": {
        "name": "Housing Starts",
        "description": "Housing Starts: Total: New Privately Owned Housing Units Started",
        "category": "Housing",
        "frequency": "Monthly",
    },
    "CSUSHPINSA": {
        "name": "Case-Shiller Home Price",
        "description": "S&P/Case-Shiller U.S. National Home Price Index",
        "category": "Housing",
        "frequency": "Monthly",
    },
    "MORTGAGE30US": {
        "name": "30Y Mortgage Rate",
        "description": "30-Year Fixed Rate Mortgage Average",
        "category": "Housing",
        "frequency": "Weekly",
    },

    # Consumer
    "UMCSENT": {
        "name": "Consumer Sentiment",
        "description": "University of Michigan Consumer Sentiment",
        "category": "Consumer",
        "frequency": "Monthly",
    },
    "PCE": {
        "name": "Personal Consumption",
        "description": "Personal Consumption Expenditures",
        "category": "Consumer",
        "frequency": "Monthly",
    },
    "RSXFS": {
        "name": "Retail Sales",
        "description": "Advance Retail Sales: Retail and Food Services",
        "category": "Consumer",
        "frequency": "Monthly",
    },

    # Money Supply & Liquidity
    "M2SL": {
        "name": "M2 Money Supply",
        "description": "M2 Money Stock",
        "category": "Liquidity",
        "frequency": "Monthly",
    },
    "WALCL": {
        "name": "Fed Balance Sheet",
        "description": "Federal Reserve Total Assets",
        "category": "Liquidity",
        "frequency": "Weekly",
    },

    # Leading Indicators
    "USSLIND": {
        "name": "Leading Index",
        "description": "Leading Index for the United States",
        "category": "Leading",
        "frequency": "Monthly",
    },
    "USREC": {
        "name": "Recession Indicator",
        "description": "NBER based Recession Indicators (1 = recession)",
        "category": "Leading",
        "frequency": "Monthly",
    },
}

# Default series to fetch (most commonly needed)
DEFAULT_SERIES = [
    # Core macro
    "FEDFUNDS", "DGS10", "DGS2", "T10Y2Y",
    # Inflation
    "CPIAUCSL", "PCEPILFE", "T5YIE",
    # Labor
    "UNRATE", "PAYEMS", "ICSA",
    # Credit
    "BAMLH0A0HYM2",
    # Consumer
    "UMCSENT",
    # Growth
    "GDP",
]


def configure_fred_api():
    """Configure FRED API key from environment."""
    api_key = os.environ.get("FRED_API_KEY")
    if api_key:
        obb.user.credentials.fred_api_key = api_key
        return True
    else:
        print("Warning: FRED_API_KEY not found in environment.")
        print("Some data may not be available. Get a free key at:")
        print("https://fred.stlouisfed.org/docs/api/api_key.html")
        return False


def fetch_series(
    series_id: str,
    start_date: Optional[str] = None,
    limit: int = 100
) -> pd.DataFrame:
    """
    Fetch a single FRED series.

    Args:
        series_id: FRED series ID (e.g., 'GDP', 'UNRATE')
        start_date: Start date for data (YYYY-MM-DD)
        limit: Maximum number of observations

    Returns:
        DataFrame with date index and value column
    """
    try:
        if start_date is None:
            # Default to 2 years of history
            start_date = (datetime.now() - timedelta(days=730)).strftime("%Y-%m-%d")

        result = obb.economy.fred_series(
            symbol=series_id,
            start_date=start_date,
            provider="fred"
        )
        df = result.to_df()

        if df.empty:
            print(f"  Warning: No data returned for {series_id}")
            return pd.DataFrame()

        return df

    except Exception as e:
        print(f"  Error fetching {series_id}: {e}")
        return pd.DataFrame()


def fetch_multiple_series(
    series_ids: List[str],
    start_date: Optional[str] = None
) -> Dict[str, pd.DataFrame]:
    """
    Fetch multiple FRED series.

    Args:
        series_ids: List of FRED series IDs
        start_date: Start date for data

    Returns:
        Dictionary mapping series_id to DataFrame
    """
    results = {}

    for series_id in series_ids:
        print(f"  - Fetching {series_id}...")
        df = fetch_series(series_id, start_date)
        if not df.empty:
            results[series_id] = df

    return results


def calculate_changes(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Calculate period-over-period changes for a series.

    Returns dict with latest value and various changes.
    """
    if df.empty or len(df) < 2:
        return {"latest": None, "latest_date": None}

    # Get the value column (first column, named after the series)
    value_col = df.columns[0]

    # Get latest value and date from index
    latest = df.iloc[-1][value_col]
    # Index is named 'date' and contains date strings like '2025-12-01'
    latest_date = str(df.index[-1])[:10]

    result = {
        "latest": latest,
        "latest_date": str(latest_date)[:10],
    }

    # Calculate changes based on available data
    try:
        if len(df) >= 2:
            prev = df.iloc[-2][value_col]
            result["prev_change"] = latest - prev
            result["prev_pct_change"] = ((latest - prev) / abs(prev) * 100) if prev != 0 else 0

        # Monthly change (if we have ~30 days of data)
        if len(df) >= 22:  # ~1 month of daily data
            month_ago = df.iloc[-22][value_col]
            result["1m_change"] = latest - month_ago
            result["1m_pct_change"] = ((latest - month_ago) / abs(month_ago) * 100) if month_ago != 0 else 0

        # Quarterly change
        if len(df) >= 63:  # ~3 months
            quarter_ago = df.iloc[-63][value_col]
            result["3m_change"] = latest - quarter_ago
            result["3m_pct_change"] = ((latest - quarter_ago) / abs(quarter_ago) * 100) if quarter_ago != 0 else 0

        # YoY change
        if len(df) >= 252:  # ~1 year
            year_ago = df.iloc[-252][value_col]
            result["1y_change"] = latest - year_ago
            result["1y_pct_change"] = ((latest - year_ago) / abs(year_ago) * 100) if year_ago != 0 else 0
    except Exception as e:
        print(f"    Warning: Error calculating changes: {e}")

    return result


def format_value(value: float, series_id: str) -> str:
    """Format value based on series type."""
    if value is None or pd.isna(value):
        return "N/A"

    # Percentage series (rates, unemployment, inflation)
    pct_series = [
        "UNRATE", "FEDFUNDS", "DFF", "DGS2", "DGS10", "DGS30",
        "T10Y2Y", "T10Y3M", "T5YIE", "T10YIE", "BAMLH0A0HYM2",
        "BAMLC0A4CBBB", "MORTGAGE30US"
    ]
    if series_id in pct_series:
        return f"{value:.2f}%"

    # Index series
    index_series = ["UMCSENT", "INDPRO", "CSUSHPINSA", "USSLIND"]
    if series_id in index_series:
        return f"{value:.1f}"

    # Large numbers (billions)
    if series_id in ["GDP", "GDPC1", "M2SL", "WALCL", "PCE"]:
        if abs(value) >= 1e6:
            return f"${value/1e6:.1f}T"
        if abs(value) >= 1e3:
            return f"${value/1e3:.1f}B"
        return f"${value:.1f}M"

    # Thousands (payrolls in thousands, so 159000 = 159M jobs)
    if series_id in ["PAYEMS"]:
        if abs(value) >= 1e3:
            return f"{value/1e3:.1f}M"
        return f"{value:.0f}K"

    # ICSA is in actual units (not thousands), typically around 200,000
    if series_id in ["ICSA"]:
        if abs(value) >= 1e6:
            return f"{value/1e6:.1f}M"
        if abs(value) >= 1e3:
            return f"{value/1e3:.0f}K"
        return f"{value:.0f}"

    # Housing starts, job openings (in thousands)
    if series_id in ["HOUST", "JTSJOL"]:
        if abs(value) >= 1e3:
            return f"{value/1e3:.1f}M"
        return f"{value:.0f}K"

    # Default
    return f"{value:.2f}"


def format_change(change: float, is_percent: bool = False) -> str:
    """Format a change value with +/- prefix."""
    if change is None or pd.isna(change):
        return "N/A"

    sign = "+" if change >= 0 else ""
    if is_percent:
        return f"{sign}{change:.2f}%"
    return f"{sign}{change:.2f}"


def generate_markdown(
    series_data: Dict[str, pd.DataFrame],
    series_metadata: Dict[str, Dict[str, str]]
) -> str:
    """Generate markdown document from fetched data."""

    today = datetime.now().strftime("%Y-%m-%d")

    md = f"""---
type: macro_indicators
created_at: {today}
updated_at: {today}
source: fred
data_provider: openbb
tags:
  - macro
  - fed
  - economic-indicators
  - openbb
status: current
---

# Macro Economic Indicators

**Generated**: {datetime.now().strftime("%Y-%m-%d %H:%M")}
**Source**: FRED via OpenBB

---

## Summary Dashboard

| Indicator | Latest | Date | Change | Category |
|-----------|--------|------|--------|----------|
"""

    # Summary table
    for series_id, df in series_data.items():
        meta = series_metadata.get(series_id, FRED_SERIES.get(series_id, {}))
        name = meta.get("name", series_id)
        category = meta.get("category", "Other")

        changes = calculate_changes(df)
        latest = format_value(changes.get("latest"), series_id)
        latest_date = changes.get("latest_date", "N/A")

        # Use appropriate change metric
        if "1m_change" in changes:
            change = format_change(changes["1m_change"])
        elif "prev_change" in changes:
            change = format_change(changes["prev_change"])
        else:
            change = "N/A"

        md += f"| **{name}** | {latest} | {latest_date} | {change} | {category} |\n"

    md += "\n---\n\n"

    # Detailed sections by category
    categories = {}
    for series_id, df in series_data.items():
        meta = series_metadata.get(series_id, FRED_SERIES.get(series_id, {}))
        category = meta.get("category", "Other")
        if category not in categories:
            categories[category] = []
        categories[category].append((series_id, df, meta))

    for category, items in categories.items():
        md += f"## {category}\n\n"

        for series_id, df, meta in items:
            name = meta.get("name", series_id)
            description = meta.get("description", "")
            frequency = meta.get("frequency", "")

            changes = calculate_changes(df)
            latest = format_value(changes.get("latest"), series_id)
            latest_date = changes.get("latest_date", "N/A")

            md += f"### {name} ({series_id})\n\n"
            md += f"_{description}_\n\n"
            md += f"**Frequency**: {frequency}\n\n"

            md += "| Metric | Value |\n"
            md += "|--------|-------|\n"
            md += f"| Latest Value | {latest} |\n"
            md += f"| As Of | {latest_date} |\n"

            if "prev_change" in changes:
                md += f"| Previous Change | {format_change(changes['prev_change'])} |\n"
            if "1m_change" in changes:
                md += f"| 1M Change | {format_change(changes['1m_change'])} ({format_change(changes['1m_pct_change'], True)}) |\n"
            if "3m_change" in changes:
                md += f"| 3M Change | {format_change(changes['3m_change'])} ({format_change(changes['3m_pct_change'], True)}) |\n"
            if "1y_change" in changes:
                md += f"| YoY Change | {format_change(changes['1y_change'])} ({format_change(changes['1y_pct_change'], True)}) |\n"

            md += "\n"

            # Recent values table (last 5)
            if len(df) >= 5:
                md += "**Recent Values:**\n\n"
                md += "| Date | Value |\n"
                md += "|------|-------|\n"
                value_col = df.columns[0]
                for i in range(-5, 0):
                    try:
                        row = df.iloc[i]
                        date = str(df.index[i])[:10]  # Index contains date strings
                        value = row[value_col]
                        md += f"| {date} | {format_value(value, series_id)} |\n"
                    except Exception:
                        pass
                md += "\n"

        md += "---\n\n"

    # Add thesis validation context
    md += """## Thesis Monitoring Notes

Use these indicators to validate macro thesis assumptions:

### Inflation Regime
- Core PCE trend vs Fed's 2% target
- Breakeven inflation expectations (T5YIE, T10YIE)
- Wage growth via employment data

### Growth Assessment
- GDP trend and revisions
- Industrial production momentum
- Consumer sentiment trajectory

### Financial Conditions
- Yield curve shape (T10Y2Y, T10Y3M)
- Credit spreads (HY OAS)
- Fed balance sheet changes

### Labor Market Health
- Unemployment rate direction
- Payroll additions vs trend
- Initial claims as leading indicator
- Job openings (JOLTS) vs hiring rate

---

## Data Refresh

To update this file, run:
```bash
source ~/openbb-env/bin/activate
python scripts/openbb/fetch_macro_indicators.py
```

To fetch specific series:
```bash
python scripts/openbb/fetch_macro_indicators.py --series DGS10,UNRATE,CPIAUCSL
```

---

## Available Series Reference

"""

    # Add reference table of all available series
    md += "| Series ID | Name | Category | Frequency |\n"
    md += "|-----------|------|----------|----------|\n"
    for series_id, meta in sorted(FRED_SERIES.items(), key=lambda x: (x[1]["category"], x[0])):
        md += f"| `{series_id}` | {meta['name']} | {meta['category']} | {meta['frequency']} |\n"

    return md


def main():
    parser = argparse.ArgumentParser(
        description="Fetch FRED macro indicators and save as markdown"
    )
    parser.add_argument(
        "--output", "-o",
        default=DEFAULT_VAULT_PATH,
        help=f"Output directory (default: {DEFAULT_VAULT_PATH})"
    )
    parser.add_argument(
        "--series", "-s",
        help="Comma-separated list of FRED series IDs (default: core indicators)"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Fetch all available series (slower)"
    )
    parser.add_argument(
        "--start-date",
        help="Start date for data (YYYY-MM-DD, default: 2 years ago)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print to stdout instead of saving to file"
    )
    parser.add_argument(
        "--list-series",
        action="store_true",
        help="List all available series and exit"
    )

    args = parser.parse_args()

    # List series and exit
    if args.list_series:
        print("\nAvailable FRED Series:\n")
        for category in sorted(set(m["category"] for m in FRED_SERIES.values())):
            print(f"\n{category}:")
            for sid, meta in sorted(FRED_SERIES.items()):
                if meta["category"] == category:
                    print(f"  {sid:15} - {meta['name']} ({meta['frequency']})")
        print(f"\nTotal: {len(FRED_SERIES)} series")
        return

    # Configure API
    print("Configuring FRED API...")
    configure_fred_api()

    # Determine which series to fetch
    if args.series:
        series_to_fetch = [s.strip().upper() for s in args.series.split(",")]
    elif args.all:
        series_to_fetch = list(FRED_SERIES.keys())
    else:
        series_to_fetch = DEFAULT_SERIES

    print(f"\nFetching {len(series_to_fetch)} FRED series...")

    # Fetch data
    series_data = fetch_multiple_series(series_to_fetch, args.start_date)

    if not series_data:
        print("Error: No data fetched. Check your FRED_API_KEY and series IDs.")
        sys.exit(1)

    print(f"\nSuccessfully fetched {len(series_data)} series")

    # Generate markdown
    print("Generating markdown...")
    markdown = generate_markdown(series_data, FRED_SERIES)

    if args.dry_run:
        print("\n" + "="*60)
        print(markdown)
        print("="*60)
    else:
        # Save to file
        today = datetime.now().strftime("%Y-%m-%d")
        filename = f"{today}-macro-indicators.md"
        output_path = Path(args.output) / filename

        output_path.write_text(markdown)
        print(f"\nSaved to: {output_path}")

    print("Done!")


if __name__ == "__main__":
    main()
