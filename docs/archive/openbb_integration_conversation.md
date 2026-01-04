# OpenBB Integration for Investment Research Workflow

## Conversation Summary
**Date**: January 4, 2026  
**Topic**: Integrating OpenBB Terminal/Platform with Obsidian-based investment research system  
**Focus Company**: Coinbase ($COIN)

---

## Context: Nick's Current System

Nick has a sophisticated knowledge management system:
- **Obsidian vault** for organizing research artifacts
- **Next.js application** backed by Supabase
- Workflow involves extracting claims from financial documents/transcripts
- Organizing with metadata and backlinks in Obsidian
- Surfacing insights through custom app connecting research to macro theses and portfolio positions

---

## Initial Question: Best Open Source Repos for Financial Markets

### Key Recommendations Provided:

**Market Data & APIs:**
- yfinance - Python library for Yahoo Finance historical data
- alpaca-trade-api - Commission-free trading API
- ccxt - Unified API for 100+ crypto exchanges
- polygon-api-client - Stock market data API client

**Analytics & Backtesting:**
- QuantLib - C++ library for quantitative finance
- backtrader - Python backtesting framework
- zipline - Algorithmic trading library (from Quantopian)
- vectorbt - Fast vectorized backtesting
- PyAlgoTrade - Event-driven algorithmic trading

**Fundamental Analysis & News:**
- **OpenBB Terminal** - Comprehensive investment research platform (MOST RELEVANT)
- finviz - Python client for FinViz
- Newspaper3k - Article scraping/extraction

**Dashboards & Visualization:**
- Mplfinance - Financial plotting utilities
- Plotly Dash - Analytical web applications

**Machine Learning:**
- FinRL - Deep reinforcement learning for trading
- mlfinlab - ML financial laboratory

---

## OpenBB Terminal Deep Dive

### What is OpenBB?
Comprehensive investment research platform aggregating data from multiple sources into unified terminal interface.

### Key Capabilities:
- **Fundamental Data**: Company financials, earnings transcripts, SEC filings, insider trading
- **Market Data**: Stocks, ETFs, crypto, forex, futures, options with technical indicators
- **News Aggregation**: Financial news, sentiment analysis, trending topics
- **Economic Data**: FRED data, government statistics, macro indicators
- **Alternative Data**: Dark pool activity, short interest, social sentiment, GitHub activity
- **Screening & Discovery**: Stock screeners, ETF comparisons, sector analysis
- **Portfolio Analysis**: Performance attribution, risk metrics, optimization

### Cost Structure:
- **OpenBB Terminal (open-source)**: Completely FREE
- **Data sources**: Mixed model
  - Many free sources: Yahoo Finance, FRED, Reddit, NewsAPI (limited), Alpha Vantage (limited)
  - Premium sources require YOUR OWN API KEYS: Bloomberg, Quandl, Benzinga, Financial Modeling Prep, Polygon.io
  - Free tiers have rate limits and delayed data
  - Real-time premium data requires subscriptions ($50-200/month typical range)
- **OpenBB Platform** (newer enterprise product): Pricing not publicly listed

---

## Specific Use Cases for Nick's Workflow

### 1. Automated Transcript Ingestion
- Script OpenBB to pull earnings call transcripts for portfolio companies
- Auto-format as markdown files with frontmatter metadata (company, date, quarter, ticker)
- Drop into Obsidian vault's transcript folder
- Existing claim extraction workflow picks up from there

### 2. Research Claim Validation Pipeline
When extracting claims like "Company X's gross margins improved 300bps YoY":
- Query OpenBB programmatically to pull actual financial data
- Auto-tag claims with `[[validated]]` or `[[needs-review]]` based on data match
- Create backlinks to specific data source/filing
- Build confidence scores into claim metadata

### 3. Thesis Monitoring Dashboard
For each investment thesis in vault:
- Pull real-time metrics supporting/refuting thesis
- Generate weekly/monthly updates as markdown files
- Flag when key metrics diverge from thesis assumptions
- Feed into Next.js app showing thesis health

### 4. Company Deep-Dive Templates
Pre-populate Obsidian company research templates with:
- Latest financials, key ratios, segment breakdowns
- Insider trading activity
- Recent news sentiment scores
- Peer comparison tables
- All formatted as markdown tables for Dataview queries

### 5. Cross-Reference Building
When researching sector/theme:
- Pull all companies in sector with specific characteristics
- Auto-create company notes with backlinks to relevant theses
- Build knowledge graph connecting companies, trends, claims

### 6. Smart Research Triggers
Set up monitoring for:
- 8-K filings (material events)
- Unusual options activity on positions
- Earnings date reminders (auto-create "prep" notes)
- News spikes requiring claim updates

---

## Proposed Integration Architecture

```
OpenBB Python SDK
    ↓
Custom Python scripts (data layer)
    ↓
Write markdown files to Obsidian vault
    ↓
Obsidian Dataview/Bases organize
    ↓
Next.js app queries via file system or API
```

---

## Starting Point Recommendation

Pick ONE company (suggested: $COIN) and build:
1. Script that pulls last 4 quarters of financials
2. Format as markdown table in a note
3. Pull latest earnings transcript
4. Extract 3-5 key quotes/claims
5. Drop everything in vault with proper metadata

Once working, template it and scale to whole portfolio.

**The Real Win**: Eliminates manual data gathering/validation steps, letting you focus on analysis and synthesis. Turns system from "reactive" (manual research) to "proactive" (data flows in, you curate and connect).

---

## Key Decision: OpenBB Workspace vs Platform SDK

### OpenBB Workspace (Web-based)
**Pros:**
- No local setup required
- Professional UI with charts, dashboards, templates
- Easier for exploratory research and visualization
- Cloud-based, access from anywhere

**Cons:**
- **Harder to integrate with Obsidian workflow** - data lives in their platform
- Less programmatic access
- Potentially costs money for full features
- You're in their ecosystem, not building your own

### OpenBB Platform (GitHub - Local SDK)
**Pros:**
- **Full programmatic control** - Python SDK for scripting
- **Direct integration with workflow** - write data straight to Obsidian vault
- Open source, free (except data source API costs)
- Build custom pipelines exactly as needed
- Data stays local in your system

**Cons:**
- Requires Python setup and learning curve
- More DIY - build your own workflows
- No pretty UI out of the box (unless you build it)

### RECOMMENDATION: OpenBB Platform (Local SDK)

**Why:**
1. Your workflow is already code-based (Next.js + Supabase)
2. Integration is key - need data flowing INTO Obsidian vault
3. Automation potential - scripts can run on schedule
4. Flexibility - build exactly the research pipeline described
5. You could use BOTH (Workspace for visual exploration, SDK for automation), but SDK is primary

---

## The ODP (Open Data Platform) Confusion

**Three-Tier Setup:**
1. **OpenBB Platform SDK** (Python) - Core data engine
2. **ODP Desktop App** - Local server that runs the SDK
3. **OpenBB Workspace** (Web UI) - Connects to local ODP for data

**The Issue**: Workspace is essentially a UI layer that needs ODP running locally to fetch data. That's why no feeds show up without it.

**Workspace Data Source Problem:**
- Workspace can be confusing about data sources
- Often need to configure API keys even for "free" sources
- Without configured sources, feeds are empty
- Unclear which features require paid accounts
- SDK gives better visibility and control

---

## Next Steps: Getting Started with OpenBB SDK

### Installation:
```bash
pip install openbb
```

### Basic Test (No API Keys Required):
```python
from openbb import obb

# Test with $COIN data
coin_data = obb.equity.profile(symbol="COIN")
print(coin_data.to_df())
```

This will either:
- Work immediately with free sources
- Give clear error about which API key is missing
- Show exact data structure to work with

### Immediate Goals for $COIN Research:

**Questions to Answer:**
1. What does your current $COIN thesis/strategy look like in Obsidian? (structure/headings)
2. What's your OpenBB setup status?
3. What's the first piece of research to augment?
   - Validate revenue growth assumptions?
   - Find recent commentary on regulatory concerns?
   - Pull recent earnings transcripts?

### Proposed First Script:
Build a Python script that:
1. Fetches $COIN latest earnings transcript
2. Pulls last 4 quarters of key financials
3. Formats both as markdown with proper frontmatter
4. Saves to specified Obsidian vault location
5. Creates backlinks to existing thesis notes

---

## Key Technical Considerations

### Data Integration Strategy:
- Start with free data sources (Yahoo Finance, FRED)
- Add specific paid API keys only for critical data (e.g., earnings transcripts)
- Use Python SDK to build custom integrations with Obsidian vault
- Real cost is **time investment** in learning platform and building integrations

### Recommended Approach:
1. Install OpenBB Platform SDK via terminal (not desktop app initially)
2. Test basic queries with $COIN
3. Build first integration script
4. Iterate based on what works
5. Add ODP/Workspace later if desired for visualization

### Why Skip Desktop App Initially:
- **More direct** - Get straight to scripting and integration
- **Better for workflow** - Need to pipe data into Obsidian, not use GUI
- **Easier debugging** - Terminal gives clear error messages
- **Full control** - Building custom scripts anyway

---

## Questions for Claude Code to Continue With:

1. **Environment Setup**: Help install OpenBB SDK and verify installation
2. **First Data Pull**: Test basic $COIN queries to see available data
3. **Obsidian Integration**: Design script to format OpenBB data as markdown
4. **File Structure**: Determine optimal vault structure for financial data
5. **Automation**: Build first end-to-end script (transcript fetch → markdown → vault)
6. **API Keys**: Identify which data sources need keys for desired use cases
7. **Error Handling**: Build robust data fetching with fallbacks
8. **Scheduling**: Set up automated updates for thesis monitoring

---

## Additional Context

**Nick's Research Interests:**
- Caitlin Long's theories on stablecoins and monetary velocity
- Mobile access solutions for development environment
- Claude Code iOS app integration with GitHub repositories
- Advanced Obsidian functionality (templates, databases, Bases feature)

**Technical Comfort Level:**
- Experienced with Next.js, Supabase, Obsidian
- Methodical approach to problem-solving
- Prefers detailed guidance with real-time updates
- Interested in architectural decisions and design rationale

---

## End of Conversation Summary

**Current Status**: Ready to begin OpenBB SDK installation and first $COIN data integration
**Next Immediate Step**: Install OpenBB Platform SDK via pip and test basic queries
**Primary Goal**: Build automated pipeline from OpenBB → formatted markdown → Obsidian vault
**Focus Company**: Coinbase ($COIN) as proof of concept

**Handoff to Claude Code**: Continue from terminal installation and begin building the integration scripts described above.
