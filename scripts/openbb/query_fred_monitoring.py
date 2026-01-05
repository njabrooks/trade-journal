#!/usr/bin/env python3
"""
FRED Monitoring Query Script

Lightweight script for querying FRED series for thesis monitoring.
Returns JSON output for consumption by Node.js monitoring system.

Usage:
    python scripts/openbb/query_fred_monitoring.py UNRATE,ICSA --days 30
    python scripts/openbb/query_fred_monitoring.py DGS10 --json
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from openbb import obb
import pandas as pd


def configure_fred_api():
    """Configure FRED API key from environment."""
    api_key = os.environ.get("FRED_API_KEY")
    if api_key:
        obb.user.credentials.fred_api_key = api_key
        return True
    else:
        print(json.dumps({"error": "FRED_API_KEY not found in environment"}), file=sys.stderr)
        return False


def fetch_series(
    series_id: str,
    start_date: str,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Fetch a single FRED series and return structured data.

    Returns:
        Dict with series metadata and values
    """
    try:
        result = obb.economy.fred_series(
            symbol=series_id,
            start_date=start_date,
            end_date=end_date,
            provider="fred"
        )
        df = result.to_df()

        if df.empty:
            return {
                "series_id": series_id,
                "error": "No data returned",
                "values": []
            }

        # Extract values
        value_col = df.columns[0]
        values = []

        for idx, row in df.iterrows():
            values.append({
                "date": str(idx)[:10],  # Format as YYYY-MM-DD
                "value": float(row[value_col]) if not pd.isna(row[value_col]) else None
            })

        # Calculate latest value and changes
        latest = None
        latest_date = None
        prev_value = None
        change = None
        change_percent = None

        if len(values) > 0:
            latest = values[-1]["value"]
            latest_date = values[-1]["date"]

            if len(values) >= 2 and values[-2]["value"] is not None:
                prev_value = values[-2]["value"]
                if prev_value != 0:
                    change = latest - prev_value
                    change_percent = (change / abs(prev_value)) * 100

        return {
            "series_id": series_id,
            "latest_value": latest,
            "latest_date": latest_date,
            "previous_value": prev_value,
            "change": change,
            "change_percent": change_percent,
            "values_count": len(values),
            "values": values,
            "error": None
        }

    except Exception as e:
        return {
            "series_id": series_id,
            "error": str(e),
            "values": []
        }


def main():
    parser = argparse.ArgumentParser(
        description="Query FRED series for monitoring (JSON output)"
    )
    parser.add_argument(
        "series",
        help="Comma-separated list of FRED series IDs (e.g., UNRATE,ICSA,DGS10)"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Number of days of history to fetch (default: 30)"
    )
    parser.add_argument(
        "--start-date",
        help="Start date (YYYY-MM-DD), overrides --days"
    )
    parser.add_argument(
        "--end-date",
        help="End date (YYYY-MM-DD), defaults to today"
    )

    args = parser.parse_args()

    # Configure API
    if not configure_fred_api():
        sys.exit(1)

    # Parse series IDs
    series_ids = [s.strip().upper() for s in args.series.split(",")]

    # Determine date range
    if args.start_date:
        start_date = args.start_date
    else:
        start_date = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")

    end_date = args.end_date or datetime.now().strftime("%Y-%m-%d")

    # Fetch all series
    results = []
    for series_id in series_ids:
        result = fetch_series(series_id, start_date, end_date)
        results.append(result)

    # Output JSON
    output = {
        "query_date": datetime.now().isoformat(),
        "start_date": start_date,
        "end_date": end_date,
        "series_count": len(results),
        "series": results
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
