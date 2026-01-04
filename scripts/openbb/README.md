# OpenBB Integration Scripts

Scripts for fetching financial data from OpenBB and formatting it for your Obsidian research vault.

## Setup

1. **Activate the virtual environment**:
   ```bash
   source ~/openbb-env/bin/activate
   ```

2. **Configure API keys** (optional, for premium data):
   ```bash
   # For earnings transcripts (FMP - free tier: 250 calls/day)
   export FMP_API_KEY=your_key_here

   # Sign up at: https://financialmodelingprep.com
   ```

## Available Scripts

### `fetch_company_data.py` - Financial Overview

Fetches company financials using **free** yfinance data:
- Company profile and description
- Income statement (4 quarters)
- Balance sheet
- Cash flow statement
- Key metrics (P/E, P/B, market cap, etc.)
- Recent SEC filings

**Usage**:
```bash
source ~/openbb-env/bin/activate
python scripts/openbb/fetch_company_data.py COIN
python scripts/openbb/fetch_company_data.py TSLA --output ~/my-vault
python scripts/openbb/fetch_company_data.py AAPL --dry-run
```

**Output**: `YYYY-MM-DD-SYMBOL-financials.md` in your vault

---

### `fetch_transcript.py` - Earnings Transcripts

Fetches earnings call transcripts (requires FMP API key):

**Usage**:
```bash
source ~/openbb-env/bin/activate
python scripts/openbb/fetch_transcript.py COIN 2025 3    # Q3 2025
python scripts/openbb/fetch_transcript.py COIN 2025      # All 2025 quarters
```

**Output**: `YYYY-MM-DD-SYMBOL-QX-YEAR-transcript.md` in your vault

---

### `fetch_macro_indicators.py` - Economic Indicators

Fetches macro economic indicators from FRED (Federal Reserve Economic Data):
- Interest rates (Fed Funds, 2Y/10Y Treasury, yield curve)
- Inflation metrics (CPI, Core PCE, breakeven rates)
- Labor market (unemployment, payrolls, initial claims)
- Credit conditions (HY OAS, BBB spreads)
- Growth indicators (GDP, industrial production)
- Consumer data (sentiment, retail sales)

**Usage**:
```bash
source ~/openbb-env/bin/activate
export FRED_API_KEY=your_key_here  # Free from FRED

# Fetch default core indicators
python scripts/openbb/fetch_macro_indicators.py

# Fetch specific series
python scripts/openbb/fetch_macro_indicators.py --series FEDFUNDS,DGS10,UNRATE

# Fetch all available series
python scripts/openbb/fetch_macro_indicators.py --all

# List available series
python scripts/openbb/fetch_macro_indicators.py --list-series
```

**Output**: `YYYY-MM-DD-macro-indicators.md` in your vault

---

## Data Source Summary

| Data | Provider | Cost |
|------|----------|------|
| Company Profile | yfinance | Free |
| Financials (income, balance, cash flow) | yfinance | Free |
| Key Metrics | yfinance | Free |
| Price History | yfinance | Free |
| SEC Filings | SEC | Free |
| Revenue by Segment | FMP | Free tier |
| **Macro Indicators** | **FRED** | **Free** |
| Earnings Transcripts | FMP | Ultimate ($149/mo) |
| News with Sentiment | Benzinga | Paid |

## API Documentation

- **FRED (Federal Reserve Economic Data)**: https://fred.stlouisfed.org/docs/api/fred/
  - [Get Free API Key](https://fred.stlouisfed.org/docs/api/api_key.html)
  - Key stored in `.env.local` as `FRED_API_KEY`
  - 812,000+ economic time series (free, unlimited calls)

- **FMP (Financial Modeling Prep)**: https://site.financialmodelingprep.com/developer/docs
  - [Pricing](https://site.financialmodelingprep.com/developer/docs/pricing)
  - Key stored in `.env.local` as `FMP_API`

  | Tier | Cost | Key Features |
  |------|------|--------------|
  | Free | $0 | 250 calls/day, 150+ endpoints, revenue segments |
  | Starter | $22/mo | 5yr history, annual fundamentals |
  | Premium | $59/mo | 30yr history, intraday, technicals |
  | Ultimate | $149/mo | **Earnings transcripts**, ETF holdings, global |

- **OpenBB Platform**: https://docs.openbb.co/platform
  - SDK documentation and provider configuration

## Obsidian Vault Structure

Files are saved to: `/Users/njb/Desktop/nick/investing/`

```
investing/
├── 2026-01-04-COIN-financials.md      # Company financials
├── 2026-01-04-COIN-Q3-2025-transcript.md  # Earnings transcript
├── 2025-12-21-audit-*.md              # Your research audits
├── templates/
│   ├── research-artifact-template.md
│   ├── asset-view-template.md
│   └── ...
```

## Integration with Research Workflow

After fetching data:

1. **For financials**: Reference the financials file when building asset views
2. **For transcripts**: Run `/process-transcript` to extract Toulmin claims
3. **Link together**: Use `[[filename]]` syntax to connect related research

## Troubleshooting

**"Extension not found" errors**: Normal on first run - OpenBB is building its extension cache.

**API key errors**: Make sure to export the key before running:
```bash
export FMP_API_KEY=your_key_here
```

**Rate limits**: yfinance and free FMP tier have limits. If you hit them, wait a few minutes.
