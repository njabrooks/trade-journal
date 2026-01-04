# Data Sources Strategy for Thesis Synthesis & Monitoring

**Status**: Planning Draft
**Created**: 2026-01-04
**Related**:
- [thesis-synthesis-monitoring.md](thesis-synthesis-monitoring.md) - Validation point system design
- [OpenBB Scripts](../../scripts/openbb/) - Python scripts for data fetching
- [/synthesize-thesis skill](../../.claude/skills/synthesize-thesis/SKILL.md) - Uses this doc during validation point definition

---

## Executive Summary

This document maps the universe of data sources needed for the thesis synthesis and monitoring workflow, evaluates cost-efficient access strategies, and proposes a tiered implementation approach.

**Key Insight**: OpenBB is our **aggregation layer**, not a data source. It unifies access to multiple providers through a single SDK. Our strategy should be:
1. Maximize free/low-cost sources through OpenBB
2. Add targeted paid APIs only where free alternatives are inadequate
3. Build pipelines that output to Obsidian vault and/or database

---

## Data Needs by Workflow Layer

### Layer 2: Thesis Synthesis (Claim Validation)

| Need | Data Type | Use Case | Frequency |
|------|-----------|----------|-----------|
| Financial validation | Income, Balance, Cash Flow | "COIN margins improved 300bps" → verify | On-demand |
| Price context | Historical prices | Entry/exit levels, trend confirmation | On-demand |
| Business context | Revenue segments, guidance | Understand thesis drivers | Quarterly |
| Macro context | Fed funds, GDP, inflation | Validate macro assumptions | Monthly |
| Regulatory filings | 10-K, 10-Q, 8-K | Source of truth for claims | On-event |

### Layer 3: Monitoring (Validation Points)

| Need | Data Type | Use Case | Frequency |
|------|-----------|----------|-----------|
| Explicit metrics | Price, volume, fundamentals | "BTC > $100K", "COIN revenue > $2B" | Daily-Weekly |
| News monitoring | Financial news, sentiment | "Regulatory environment hostile" | Daily |
| Event detection | Filings, insider trades | Material developments | Real-time |
| Macro indicators | Economic releases | Thesis assumption changes | On-release |
| Crypto metrics | On-chain, prices | Crypto-related theses | Daily |

---

## Data Source Universe

### Tier 0: EXISTING PAID SUBSCRIPTIONS (Already Available)

These are data sources we already have access to through existing integrations.

| Source | Data Type | Access Method | Status |
|--------|-----------|---------------|--------|
| **IBKR Client Portal Gateway** | Real-time prices, historical OHLCV, IV snapshots, contract lookup | Local gateway API | ✅ Integrated |
| **Massive.com** | Daily spot prices, IV30, options data | REST API | ✅ Integrated |

#### IBKR Client Portal Gateway Capabilities

Already integrated in `src/lib/services/ibkr/`:

| Capability | Module | Notes |
|------------|--------|-------|
| Real-time spot prices | `marketdata.ts` | Via snapshot endpoint |
| Real-time IV data | `iv-data.ts` | Via snapshot endpoint |
| Historical spot prices | `historical-spot.ts` | Up to 2 years, daily bars |
| Contract ID lookup | `contracts.ts` | Search by symbol |
| Data priority fallback | `data-priority.ts` | IBKR → Massive → others |

**Key limitations**:
- Requires local gateway running and authenticated
- Only works during market hours for real-time data
- Historical data capped at 2 years

#### Massive.com Capabilities

Already integrated in `src/lib/ingestion/massive/`:

| Capability | Module | Notes |
|------------|--------|-------|
| Daily spot prices | `spotAndIv.ts` | OHLC data |
| IV30 | `spotAndIv.ts` | May require paid tier |
| Scheduled ingestion | GitHub Actions | Daily at 4:30 PM ET |

**Current data priority** (from `data-priority.ts`):
- **Spot**: IBKR → Massive → Yahoo Finance → OptStrat → Manual
- **IV**: Massive → OptStrat → Manual

### Tier 1: FREE Sources (Use First)

| Source | Data Type | Access Method | Limits |
|--------|-----------|---------------|--------|
| **yfinance** | Prices, financials, profiles | OpenBB | Unofficial, rate limited |
| **SEC EDGAR** | All regulatory filings | OpenBB or direct API | 10 req/sec |
| **FRED** | 812K+ economic series | OpenBB or direct API | Free with API key |
| **CoinGecko** | Crypto prices, market data | Direct API | 30 req/min, 10K/month |
| **Yahoo Finance** | Basic transcripts (some) | Manual scraping | Inconsistent |
| **Motley Fool** | Select transcripts | Manual | Limited coverage |

### Tier 2: Low-Cost Sources ($0-50/month)

| Source | Data Type | Cost | Access | Best For |
|--------|-----------|------|--------|----------|
| **FMP (Free tier)** | Revenue segments, 150+ endpoints | $0 | OpenBB | Segment data, basic fundamentals |
| **EODHD** | Global EOD, fundamentals | $20-30/mo | OpenBB | Historical data, international |
| **Alpha Vantage** | Prices, fundamentals | $50/mo (free: 25/day) | OpenBB | Prototyping |
| **Finnhub** | News, sentiment, transcripts | Free tier generous | Direct | News monitoring |
| **API Ninjas** | Earnings transcripts | Pay-per-call | Direct | Transcript access |

### Tier 3: Medium-Cost Sources ($50-200/month)

| Source | Data Type | Cost | Access | Best For |
|--------|-----------|------|--------|----------|
| **FMP Premium** | Intraday, technicals | $59/mo | OpenBB | Technical analysis |
| **Polygon.io** | Real-time, options | ~$100/mo+ | OpenBB | High-frequency, options |
| **CoinGecko Pro** | Higher limits, faster | $129/mo | Direct | Heavy crypto usage |
| **FMP Ultimate** | **Earnings transcripts**, ETF holdings | $149/mo | OpenBB | Automated transcript pipeline |

### Tier 4: Enterprise Sources ($200+/month)

| Source | Data Type | Cost | Access | Best For |
|--------|-----------|------|--------|----------|
| **Benzinga Pro** | News, sentiment, analyst ratings | ~$200+/mo | OpenBB | Professional news flow |
| **Quandl/Nasdaq Data Link** | Alternative data, institutional | A la carte | OpenBB | Specialized datasets |
| **Bloomberg Terminal** | Everything | $2K+/mo | Manual | Institutional (overkill for us) |

---

## Recommended Access Strategy

### Phase 1: Foundation (Current State + Quick Wins)

**Cost: $0/month additional** (IBKR and Massive already paid)

Already configured:
- ✅ **IBKR Client Portal Gateway** (real-time spot, IV, historical prices)
- ✅ **Massive.com** (daily spot, IV30)
- ✅ **OpenBB SDK** with yfinance (fundamentals, profiles)
- ✅ **SEC EDGAR** via OpenBB (all filings)
- ✅ **FMP Free tier** (revenue segments)

Add immediately:
- [x] **FRED API key** (free) - 812K economic series ✅ Key in `.env.local`
- [ ] **CoinGecko** (free tier) - crypto prices and market data
- [ ] **Finnhub** (free tier) - news with sentiment

**Coverage achieved**: ~80% of monitoring needs (higher than before due to IBKR/Massive)

### Phase 2: Enhanced Monitoring ($20-60/month)

Add when monitoring automation begins:
- [ ] **EODHD** ($20/mo) - Global EOD data, better historical coverage
- [ ] **NewsAPI or Benzinga Basic** (free via AWS Marketplace) - News monitoring

**Coverage achieved**: ~85% of monitoring needs

### Phase 3: Full Automation ($100-200/month)

Add when thesis monitoring is production-ready:
- [ ] **FMP Ultimate** ($149/mo) - Automated earnings transcripts
- [ ] **CoinGecko Analyst** ($129/mo) - If heavy crypto thesis monitoring

**Coverage achieved**: ~95% of monitoring needs

---

## Source-to-Need Mapping

### For Explicit Validation Points

| Metric Type | Primary Source | Backup Source | Access |
|-------------|----------------|---------------|--------|
| Stock price (real-time) | **IBKR Gateway** | Massive | Local API |
| Stock price (historical) | **IBKR Gateway** | yfinance | Local API / OpenBB |
| IV30 | **Massive** | - | REST API |
| Crypto price | CoinGecko | yfinance | Direct/OpenBB |
| Revenue/EPS | yfinance | FMP | OpenBB |
| Margins | yfinance | SEC filings | OpenBB |
| Fed funds rate | FRED | - | OpenBB |
| Inflation (CPI) | FRED | - | OpenBB |
| GDP | FRED | - | OpenBB |

### For Judgment-Required Points

| Observable | Primary Source | Backup Source | Access |
|------------|----------------|---------------|--------|
| Regulatory news | Finnhub/NewsAPI | Benzinga | Direct |
| Enforcement actions | SEC EDGAR (8-K) | News | OpenBB |
| Insider selling | SEC EDGAR (Form 4) | yfinance | OpenBB |
| Earnings surprises | yfinance | FMP | OpenBB |
| Sentiment shift | Finnhub | Benzinga | Direct |
| Crypto on-chain | CoinGecko | - | Direct |

### For Research Inputs

| Content Type | Primary Source | Backup Source | Cost |
|--------------|----------------|---------------|------|
| Earnings transcripts | Manual (Seeking Alpha) | FMP Ultimate | Free / $149/mo |
| SEC filings | SEC EDGAR | - | Free |
| News articles | Finnhub | NewsAPI | Free |
| Analyst reports | Manual | - | Varies |
| Economic commentary | FRED blog | Manual | Free |

---

## Earnings Transcripts Strategy

Transcripts are a special case - critical for research but expensive to automate.

### Option A: Manual Workflow (Current)
- Source transcripts from Seeking Alpha, Motley Fool, YouTube
- Process with `/process-transcript` skill
- Upload via `/finalize-for-upload`

**Pros**: Free, full control over quality
**Cons**: Manual effort, not scalable

### Option B: FMP Ultimate ($149/month)
- Automated transcript fetching via OpenBB
- Script to pull all portfolio company transcripts quarterly

**Pros**: Automated, consistent format
**Cons**: Cost, only worth it if monitoring many companies

### Option C: Hybrid Approach (Recommended)
1. Use free sources (Motley Fool, Yahoo, company IR sites) for core holdings
2. Add FMP Ultimate only when:
   - Monitoring >20 companies
   - Thesis monitoring automation is live
   - ROI justifies cost

**Implementation**: Start with Option A, graduate to C when scale demands it.

---

## Pipeline Architecture

### Data Flow Overview

```
EXTERNAL SOURCES
    │
    ├── EXISTING INTEGRATIONS (Tier 0)
    │   │
    │   ├── IBKR Client Portal Gateway (localhost:5001)
    │   │   ├── Real-time spot prices → src/lib/services/ibkr/marketdata.ts
    │   │   ├── Real-time IV → src/lib/services/ibkr/iv-data.ts
    │   │   ├── Historical OHLCV → src/lib/services/ibkr/historical-spot.ts
    │   │   └── Contract lookup → src/lib/services/ibkr/contracts.ts
    │   │
    │   └── Massive.com API
    │       ├── Daily spot prices → src/lib/ingestion/massive/spotAndIv.ts
    │       └── IV30 → src/lib/ingestion/massive/spotAndIv.ts
    │
    ├── OpenBB SDK (aggregation layer - Tier 1+)
    │   ├── yfinance (fundamentals, profiles)
    │   ├── SEC EDGAR (filings)
    │   ├── FMP (revenue segments)
    │   ├── FRED (economic data)
    │   └── others...
    │
    ├── Direct APIs (Tier 1)
    │   ├── CoinGecko (crypto)
    │   ├── Finnhub (news/sentiment)
    │   └── others...
    │
    └── Manual Inputs
        ├── Transcripts
        ├── Analyst reports
        └── Commentary
            │
            ▼
    PROCESSING LAYER
    │
    ├── Existing TypeScript Services
    │   ├── src/lib/services/ibkr/ → underlyings_iv_history table
    │   └── src/lib/ingestion/massive/ → underlyings_iv_history table
    │
    ├── Python Scripts (scripts/openbb/)
    │   ├── fetch_company_data.py → Obsidian vault ✅
    │   ├── fetch_transcript.py (blocked - needs FMP Ultimate)
    │   ├── fetch_macro_indicators.py → Obsidian vault ✅
    │   ├── fetch_crypto_data.py (planned)
    │   └── monitor_validation_points.py (planned)
    │
    └── Claude Code Skills
        ├── /process-transcript
        ├── /synthesize-claims
        └── /monitor-theses (future)
            │
            ▼
    OUTPUT TARGETS
    │
    ├── Obsidian Vault (/Users/njb/Desktop/nick/investing/)
    │   ├── YYYY-MM-DD-TICKER-financials.md (OpenBB scripts)
    │   ├── YYYY-MM-DD-TICKER-transcript.md (manual + skills)
    │   └── ...
    │
    └── Supabase Database
        ├── underlyings_iv_history (IBKR + Massive)
        ├── research_artifacts
        ├── research_insights
        ├── validation_status_history
        └── ...
```

### Script Inventory (Current + Planned)

| Script | Status | Input | Output | Sources |
|--------|--------|-------|--------|---------|
| `fetch_company_data.py` | ✅ Done | Ticker | Markdown to vault | yfinance, FMP, SEC |
| `fetch_transcript.py` | ⚠️ Blocked | Ticker, Year, Q | Markdown to vault | FMP (needs Ultimate) |
| `fetch_macro_indicators.py` | ✅ Done | Indicator list | Markdown to vault | FRED (34 series) |
| `fetch_crypto_data.py` | 📋 Planned | Coin symbol | Markdown to vault | CoinGecko |
| `monitor_validation_points.py` | 📋 Planned | VP IDs | Status updates to DB | Multiple |

---

## Implementation Roadmap

### Immediate (This Week)
1. [x] Set up OpenBB with yfinance, SEC, FMP free tier
2. [x] Create `fetch_company_data.py` script
3. [x] Add FRED API key to `.env.local`
4. [x] Create `fetch_macro_indicators.py` for key economic series (34 series available)
5. [ ] Test CoinGecko free tier access

### Short-term (Next 2-4 Weeks)
1. [ ] Create `fetch_crypto_data.py` for crypto thesis monitoring
2. [ ] Add Finnhub for news sentiment access
3. [ ] Build news monitoring prototype for judgment-required points
4. [ ] Document manual transcript workflow with free sources

### Medium-term (When Thesis Monitoring Goes Live)
1. [ ] Evaluate FMP Ultimate ROI based on company coverage
2. [ ] Build `monitor_validation_points.py` scheduler
3. [ ] Integrate with GitHub Actions for automated monitoring
4. [ ] Add EODHD if historical data gaps emerge

---

## Cost Projection

| Phase | Monthly Cost | Sources |
|-------|--------------|---------|
| Foundation | $0 | yfinance, SEC, FMP free, FRED, CoinGecko free |
| Enhanced | $20-60 | + EODHD, NewsAPI |
| Full | $150-200 | + FMP Ultimate or CoinGecko Pro |

**Annual budget range**: $0 - $2,400/year depending on automation needs.

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Real-time spot/IV | **IBKR Gateway + Massive** | Already integrated, highest reliability for portfolio |
| Aggregation layer | OpenBB SDK | Unifies additional sources, Python-native, active development |
| Fundamentals | yfinance via OpenBB | Best free coverage for financials/profiles |
| Transcript strategy | Manual first, FMP Ultimate later | Cost doesn't justify automation until scale |
| Crypto data | CoinGecko free tier | Best free crypto API, covers most needs |
| Economic data | FRED | Authoritative, free, 812K series |
| News/sentiment | Finnhub free tier | Generous limits, includes sentiment |

---

## Integration with Thesis Synthesis

This document is the **authoritative reference** for data source availability during the `/synthesize-thesis` workflow. When Claude and the user collaborate on defining validation points, this information guides the conversation.

### How Data Sources Inform Validation Point Design

During thesis synthesis (Step 4-6 of the skill), Claude should:

1. **For explicit metrics**, suggest the most appropriate data source:
   ```
   User: "Fed funds rate exceeds 6%"
   Claude: "I can monitor this via FRED - FEDFUNDS (daily updates, automated).
            Current value: 3.72%. Would you like this as the primary source?"
   ```

2. **For judgment-required points**, suggest observable proxies with data access:
   ```
   User: "Regulatory environment becomes hostile"
   Claude: "This is judgment-required. I'd suggest these observable proxies:
            - SEC enforcement actions (SEC EDGAR 8-K, automated)
            - Regulatory news sentiment (Finnhub, semi-automated)
            - Legislative proposals (manual tracking)
            Which would you like to include?"
   ```

3. **When no good source exists**, be transparent:
   ```
   User: "Developer sentiment shifts away from CUDA"
   Claude: "This doesn't have a directly monitorable data source.
            Options:
            A) Accept as judgment-required with monthly manual review
            B) Use proxy: GitHub stars for PyTorch+ROCm vs CUDA (manual)
            C) Use proxy: Finnhub news sentiment for related keywords
            Which approach works for you?"
   ```

### Automation Levels to Communicate

| Level | What It Means | Example |
|-------|---------------|---------|
| **Automated (scheduled)** | Runs without intervention | Massive IV30 daily |
| **Automated (on-demand)** | Script exists, invoke when needed | `fetch_macro_indicators.py` |
| **Semi-automated** | API available, no script yet | CoinGecko prices |
| **Manual** | Human must look it up | Analyst reports |
| **Paid** | Available with subscription | FMP transcripts ($149/mo) |

### Cost Transparency

When suggesting paid sources, always note:
- The cost
- What free alternative exists (if any)
- When the paid source becomes worthwhile

This allows users to make informed decisions about the trade-off between monitoring automation and cost.

---

## Open Questions

1. **Transcript automation timing**: At what scale (# of companies) does FMP Ultimate become worth $149/mo?
2. **News monitoring depth**: How much news processing is needed vs. manual review?
3. **Crypto on-chain data**: Do we need deeper on-chain metrics beyond CoinGecko?
4. **International coverage**: Are there thesis needs for non-US equities?

---

## Sources

### API Documentation

**Tier 0 - Existing Integrations:**
- [IBKR Client Portal Gateway API](https://ibkrcampus.com/campus/ibkr-api-page/webapi-ref/) - Real-time/historical prices, IV, contracts
- [Massive.com API](https://massive.com/docs/rest) - Daily spot, IV30, options data

**Tier 1 - Free Sources:**
- [OpenBB Platform Docs](https://docs.openbb.co/platform) - Aggregation layer
- [FRED API Docs](https://fred.stlouisfed.org/docs/api/fred/) - 812K+ economic series (key in `.env.local`)
- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) - All regulatory filings
- [CoinGecko API](https://www.coingecko.com/en/api) | [Pricing](https://www.coingecko.com/en/api/pricing) - Crypto data
- [Finnhub API Docs](https://finnhub.io/docs/api) - News, sentiment

**Tier 2+ - Paid Sources:**
- [FMP API Docs](https://site.financialmodelingprep.com/developer/docs) | [Pricing](https://site.financialmodelingprep.com/developer/docs/pricing) - Fundamentals, transcripts

### Comparisons & Reviews
- [Best Financial APIs 2025 (Medium)](https://medium.com/coinmonks/the-7-best-financial-apis-for-investors-and-developers-in-2025-in-depth-analysis-and-comparison-adbc22024f68)
- [Financial Data APIs Complete Guide (ksred)](https://www.ksred.com/the-complete-guide-to-financial-data-apis-building-your-own-stock-market-data-pipeline-in-2025/)
- [Top Cryptocurrency APIs (Medium)](https://medium.com/coinmonks/top-5-cryptocurrency-data-apis-comprehensive-comparison-2025-626450b7ff7b)
- [Where to Find Earnings Transcripts](https://www.earningscall.ai/blog/Where-to-Find-Earnings-Call-Transcripts)

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-04 | Claude + User | Initial strategy draft |
| 2026-01-04 | Claude + User | Added integration with thesis synthesis section, cross-references |
