#!/usr/bin/env python3
"""
OpenBB Earnings Transcript Fetcher → Obsidian Markdown

Fetches earnings call transcripts from OpenBB (requires FMP API key)
and formats them as markdown for Nick's Obsidian research vault.

SETUP:
1. Sign up at https://financialmodelingprep.com (free tier: 250 calls/day)
2. Get your API key from the dashboard
3. Configure OpenBB:
   source ~/openbb-env/bin/activate
   python -c "from openbb import obb; obb.user.credentials.fmp_api_key = 'YOUR_KEY'"

   Or set environment variable:
   export FMP_API_KEY=your_key_here

Usage:
    source ~/openbb-env/bin/activate
    python scripts/openbb/fetch_transcript.py COIN 2025 3  # Q3 2025
    python scripts/openbb/fetch_transcript.py COIN 2025     # All 2025 quarters
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List

try:
    from openbb import obb
    import pandas as pd
except ImportError:
    print("Error: OpenBB not installed. Run: pip install openbb")
    sys.exit(1)


# Default Obsidian vault path
DEFAULT_VAULT_PATH = "/Users/njb/Desktop/nick/investing"


def configure_api_key():
    """Check and configure FMP API key."""
    # Check environment variables (support both naming conventions)
    api_key = os.environ.get("FMP_API_KEY") or os.environ.get("FMP_API")
    if api_key:
        obb.user.credentials.fmp_api_key = api_key
        return True

    # Try to access - will fail if not configured
    try:
        # Test with a simple call
        result = obb.equity.calendar.earnings(symbol="AAPL", provider="fmp")
        return True
    except Exception as e:
        if "fmp_api_key" in str(e).lower():
            return False
        return True  # Some other error, key might be configured


def fetch_transcript(symbol: str, year: int, quarter: Optional[int] = None) -> List[dict]:
    """Fetch earnings transcript(s) for a company."""
    transcripts = []

    quarters_to_fetch = [quarter] if quarter else [1, 2, 3, 4]

    for q in quarters_to_fetch:
        try:
            result = obb.equity.fundamental.transcript(
                symbol=symbol,
                year=year,
                quarter=q,
                provider="fmp"
            )
            df = result.to_df()
            if not df.empty:
                for _, row in df.iterrows():
                    transcripts.append({
                        "symbol": symbol,
                        "year": year,
                        "quarter": q,
                        "date": row.get("date", ""),
                        "content": row.get("content", ""),
                    })
        except Exception as e:
            if "not found" in str(e).lower() or "no data" in str(e).lower():
                print(f"  No transcript found for {symbol} Q{q} {year}")
            else:
                print(f"  Error fetching Q{q}: {e}")

    return transcripts


def fetch_company_profile(symbol: str) -> dict:
    """Fetch company profile for context."""
    try:
        result = obb.equity.profile(symbol=symbol, provider="yfinance")
        df = result.to_df()
        if not df.empty:
            return df.iloc[0].to_dict()
    except Exception:
        pass
    return {}


def generate_transcript_markdown(transcript: dict, profile: dict) -> str:
    """Generate markdown for a single transcript."""
    symbol = transcript["symbol"]
    year = transcript["year"]
    quarter = transcript["quarter"]
    date = transcript.get("date", "")
    content = transcript.get("content", "No content available")

    company_name = profile.get("name", symbol)

    # Clean up the date
    if date and hasattr(date, "strftime"):
        date_str = date.strftime("%Y-%m-%d")
    else:
        date_str = str(date)[:10] if date else f"{year}-Q{quarter}"

    md = f"""---
id:
type: research_artifact
created_at: {datetime.now().strftime("%Y-%m-%d")}
updated_at: {datetime.now().strftime("%Y-%m-%d")}
source_type: earnings_transcript
source_url: https://financialmodelingprep.com
title: {company_name} Q{quarter} {year} Earnings Call Transcript
author: {company_name} Management
published_date: {date_str}
content_format: text
ticker: {symbol}
fiscal_year: {year}
fiscal_quarter: {quarter}
tags:
  - transcript
  - earnings-call
  - {symbol.lower()}
  - q{quarter}-{year}
status: raw
---

# {company_name} ({symbol}) - Q{quarter} {year} Earnings Call

**Date**: {date_str}
**Source**: OpenBB (FMP provider)
**Type**: Earnings Call Transcript

---

## Transcript

{content}

---

## Key Claims to Extract

_Use /process-transcript to extract Toulmin-framework claims from this transcript_

### Thesis Candidates
-

### View Candidates
-

### Notable Data Points
-

---

## Related Research

_Link to related financials, audits, and claims_

- [[{datetime.now().strftime("%Y-%m-%d")}-{symbol}-financials]]

"""
    return md


def main():
    parser = argparse.ArgumentParser(
        description="Fetch earnings transcripts from OpenBB (FMP) and save as markdown"
    )
    parser.add_argument("symbol", help="Stock ticker symbol (e.g., COIN, AAPL)")
    parser.add_argument("year", type=int, help="Fiscal year (e.g., 2025)")
    parser.add_argument("quarter", type=int, nargs="?", help="Fiscal quarter (1-4), omit for all quarters")
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

    # Check API key
    if not configure_api_key():
        print("Error: FMP API key not configured.")
        print("\nTo set up:")
        print("1. Sign up at https://financialmodelingprep.com (free tier available)")
        print("2. Get your API key from the dashboard")
        print("3. Set environment variable: export FMP_API_KEY=your_key_here")
        print("   Or configure in Python:")
        print('   from openbb import obb; obb.user.credentials.fmp_api_key = "YOUR_KEY"')
        sys.exit(1)

    print(f"Fetching transcripts for {symbol} {args.year}...")

    # Fetch profile for context
    print("  - Company profile...")
    profile = fetch_company_profile(symbol)

    # Fetch transcripts
    print("  - Earnings transcripts...")
    transcripts = fetch_transcript(symbol, args.year, args.quarter)

    if not transcripts:
        print(f"\nNo transcripts found for {symbol} in {args.year}")
        sys.exit(0)

    print(f"\nFound {len(transcripts)} transcript(s)")

    # Generate and save markdown for each
    for transcript in transcripts:
        markdown = generate_transcript_markdown(transcript, profile)

        if args.dry_run:
            print("\n" + "="*60)
            print(f"Q{transcript['quarter']} {transcript['year']}")
            print("="*60)
            print(markdown[:2000] + "..." if len(markdown) > 2000 else markdown)
        else:
            # Save to file
            q = transcript["quarter"]
            y = transcript["year"]
            filename = f"{datetime.now().strftime('%Y-%m-%d')}-{symbol}-Q{q}-{y}-transcript.md"
            output_path = Path(args.output) / filename

            output_path.write_text(markdown)
            print(f"  Saved: {output_path}")

    print("\nDone!")


if __name__ == "__main__":
    main()
