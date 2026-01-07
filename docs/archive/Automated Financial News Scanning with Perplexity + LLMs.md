# Automated Financial News Scanning with Perplexity + LLMs

_A design, cost, and capability discussion_

---

## 1. Comparing ChatGPT / Claude / Grok / Gemini vs Perplexity for Daily News Scanning

### TL;DR

- **Perplexity** is better for _raw daily news scanning_ (high recall, citations, discovery).
    
- **ChatGPT / Claude / Grok / Gemini** are better for _thinking_ (synthesis, second-order effects).
    
- **Best setup**: Perplexity for intake → LLM for analysis.
    

Trying to force one tool to do both is sub-optimal.

---

### What “Daily News Scanning” Requires

1. Live web access
    
2. High recall (don’t miss obscure but material items)
    
3. Source transparency
    
4. Fast iteration across:
    
    - Watchlists (stocks, crypto, ETFs)
        
    - Keywords (SEC, lawsuit, guidance, downgrade, supply chain, etc.)
        

This is fundamentally a **search problem first**, reasoning problem second.

---

### Perplexity: Purpose-Built for Discovery

**Strengths**

- Live web search
    
- Automatic citation & source linking
    
- High recall across Reuters, WSJ, filings, niche blogs
    
- Excellent for morning briefings and keyword-conditioned scans
    

**Weaknesses**

- Shallow synthesis
    
- Weak at second-order reasoning and strategy formation
    

**Verdict**: Best _news intake layer_

---

### LLMs: Thinking Engines, Not Scanners

#### ChatGPT

- Strengths: synthesis, macro framing, “what matters vs noise”
    
- Weakness: exhaustive discovery
    

#### Claude

- Strengths: long-form digestion, document analysis
    
- Weakness: real-time discovery
    

#### Grok

- Strengths: early X/Twitter narratives
    
- Weakness: credibility and noise
    

#### Gemini

- Strengths: mainstream coverage
    
- Weakness: financial nuance
    

---

### Optimal Daily Workflow

1. **Morning (5–10 mins)** – Perplexity scan
    
2. **Then** – Paste results into ChatGPT or Claude for:
    
    - Signal vs noise
        
    - Second-order implications
        
    - Positioning impact
        

---

## 2. Automating the Pipeline (APIs → DB → Frontend)

### High-Level Pipeline

Scheduler (cron)  
→ Query builder (watchlist × keyword packs)  
→ Perplexity Search API (discovery)  
→ Normalizer + deduper  
→ LLM structuring (strict JSON)  
→ Postgres (local or Supabase)  
→ Frontend (daily briefs, alerts, drill-downs)

Key principle: **store raw + derived**. Raw never changes; derived can be re-run.

---

### API Pattern

- **Discovery**: Perplexity Search API (raw results)
    
- **Structuring**: Claude or ChatGPT (JSON extraction)
    
- **Reasoning/UI**: LLMs downstream, not during discovery
    

---

### Suggested Database Tables

- `news_ingest_runs`
    
- `news_raw_items`
    
- `news_items`
    
- `news_item_entities`
    
- `news_item_signals`
    
- `news_item_keywords`
    
- (optional) embeddings for semantic search
    

---

### Signal Metadata to Force

- Impact: low / medium / high
    
- Time horizon: intraday / days / weeks / quarters
    
- Mechanism: causal channel (earnings, multiple, risk)
    

---

## 3. Perplexity Pricing: Is There a Catch?

### Subscription vs API

- **Perplexity Pro (consumer)**:
    
    - Unlimited interactive searches
        
    - ❌ No API access
        
- **Perplexity API**:
    
    - Usage-based
        
    - Completely separate billing
        

---

### Search API Pricing

- **$5 per 1,000 requests**
    
- No token costs
    
- One request = one search query
    

---

### Realistic Cost Modeling

#### Naïve (don’t do this)

- 20 tickers × 3 keyword packs = 60 requests/day
    
- Cost ≈ **$0.31/day** → **$6–7/month**
    

#### Well-designed (recommended)

- Batched OR queries (3–5 per day total)
    
- Cost ≈ **$0.02–$0.05/day**
    
- **~$0.50–$1/month**
    

LLM structuring cost on top: **another $1–$2/month**

**Total system cost**: _~$1–$3/month_

---

### What Makes Costs Jump

- Per-ticker queries
    
- High-frequency scans
    
- Re-scanning same window repeatedly
    
- Using Sonar / Deep Research instead of Search API
    

Rule:

> Use Search API for discovery, LLMs after URLs are known.

---

## 4. Can Perplexity Compete with Bloomberg / Benzinga?

### Short Answer

Yes — **for coverage**, with an important caveat.

---

### Where Perplexity Competes or Wins

#### Breadth of Sources

- Reuters, Dow Jones / WSJ
    
- SEC filings, court dockets
    
- Corporate PRs
    
- Regional and niche publications
    
- Crypto-native sources
    

Perplexity indexes _everything_. For “did something happen?”, indexing wins.

---

#### Speed to Non-Consensus Signals

- Early litigation
    
- Regulatory drafts
    
- Local shutdowns
    
- Trade-press M&A chatter
    

Bloomberg is cautious. Perplexity is agnostic.

---

#### Crypto & Frontier Markets

- Protocol issues
    
- Exchange outages
    
- Governance proposals
    

Perplexity often beats traditional financial media here.

---

### Where Bloomberg Still Dominates

- Original journalism & exclusives
    
- Institutional framing
    
- Integrated workflow (news + analytics + execution)
    

Perplexity is **not** a terminal replacement — but that’s not the goal.

---

### Benzinga Comparison

- Benzinga: retail-tilted, US-equities-focused
    
- Perplexity: broader, more neutral, better long-tail risk
    

For serious ingestion: **Perplexity > Benzinga**

---

## 5. The Real “Catch”

There is no pricing catch.

The real trade-off is:

> You replace editorial judgment with your own system design.

If you design:

- Good batching
    
- Strong deduplication
    
- Clear schemas
    
- Signal scoring
    

You get **institution-grade coverage at hobbyist cost**.

---

## 6. Bottom Line

- Perplexity Search API is competitive on coverage
    
- Often better than Benzinga
    
- Not a Bloomberg terminal — but perfect for ingestion
    
- Extremely cost-effective
    
- Dangerous only if poorly filtered
    

---

## 7. Potential Next Steps

- Bloomberg-style event taxonomy
    
- Source credibility scoring
    
- Alerting layer (“Bloomberg-lite”)
    
- Coverage stress-tests vs traditional terminals
    

---

_End of document._