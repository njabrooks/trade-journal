# FRED Indicators Reference by Macro Thesis

This document maps FRED (Federal Reserve Economic Data) indicators to active macro theses in the system. Use this reference when:
- Creating new thesis monitoring configs
- Running the `/build-core-argument` skill to identify relevant data sources
- Setting up auto-trigger thresholds for validation/invalidation points

**Last Updated:** 2026-01-10
**FRED API Base:** `https://api.stlouisfed.org/fred`
**Total Active Theses:** 22

---

## Quick Reference: Most Used FRED Series

| Series ID | Name | Frequency | Category |
|-----------|------|-----------|----------|
| DGS2 | 2-Year Treasury Yield | Daily | Interest Rates |
| DGS10 | 10-Year Treasury Yield | Daily | Interest Rates |
| DGS30 | 30-Year Treasury Yield | Daily | Interest Rates |
| T10Y2Y | 10Y-2Y Spread | Daily | Interest Rates |
| FEDFUNDS | Fed Funds Rate | Monthly | Interest Rates |
| DFEDTARU | Fed Funds Target Upper | Daily | Interest Rates |
| CPIAUCSL | CPI All Urban | Monthly | Inflation |
| CPILFESL | Core CPI (ex Food/Energy) | Monthly | Inflation |
| PCEPI | PCE Price Index | Monthly | Inflation |
| PCEPILFE | Core PCE | Monthly | Inflation |
| T5YIE | 5Y Breakeven Inflation | Daily | Inflation |
| T10YIE | 10Y Breakeven Inflation | Daily | Inflation |
| UNRATE | Unemployment Rate | Monthly | Labor |
| PAYEMS | Nonfarm Payrolls | Monthly | Labor |
| ICSA | Initial Jobless Claims | Weekly | Labor |
| GDPC1 | Real GDP | Quarterly | Output |
| INDPRO | Industrial Production | Monthly | Output |
| UMCSENT | Consumer Sentiment | Monthly | Sentiment |
| DTWEXBGS | Trade-Weighted Dollar | Daily | Currency |
| BAMLH0A0HYM2 | High Yield Spread | Daily | Credit |
| TEDRATE | TED Spread | Daily | Credit |
| WALCL | Fed Balance Sheet | Weekly | Liquidity |
| RRPONTSYD | Reverse Repo | Daily | Liquidity |
| M2SL | M2 Money Supply | Monthly | Money |

---

## Thesis-to-Indicator Mapping

### 1. AI Adoption Drives PMI Reflation (2025-2026)
**Thesis:** AI adoption drives productivity gains leading to PMI expansion and reflationary environment.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | MANEMP | Manufacturing Employment | Direct manufacturing activity |
| 2 | INDPRO | Industrial Production | Productivity proxy |
| 3 | CAPG11 | Private Fixed Investment | Business investment in equipment |
| 4 | AWHMAN | Avg Weekly Hours: Manufacturing | Labor utilization |
| 5 | IPMAN | Industrial Production: Manufacturing | Manufacturing output |

**Supplementary:** DGORDER (Durable Goods), NEWORDER (New Orders), PCEPILFE (Core PCE for inflation)

---

### 2. AI Infrastructure Investment Thesis
**Thesis:** Massive capital deployment into AI infrastructure (data centers, chips, power).

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | PNFI | Private Nonresidential Fixed Investment | Business CapEx |
| 2 | BOGZ1FL105013665Q | Business Equipment Investment | Tech spending proxy |
| 3 | INDPRO | Industrial Production | Economic activity |
| 4 | TCU | Capacity Utilization | Infrastructure demand |
| 5 | PERMIT | Building Permits | Construction activity |

**Supplementary:** DGORDER (Durable Goods), IPG3361T3S (Motor Vehicle Production as industrial proxy)

---

### 3. Bitcoin as Monetary Hedge
**Thesis:** Bitcoin serves as hedge against monetary debasement and dollar weakness.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | M2SL | M2 Money Supply | Money printing proxy |
| 2 | WALCL | Fed Balance Sheet | QE/QT indicator |
| 3 | DTWEXBGS | Trade-Weighted Dollar Index | Dollar strength |
| 4 | T10YIE | 10Y Breakeven Inflation | Inflation expectations |
| 5 | BOGMBASE | Monetary Base | Base money expansion |

**Supplementary:** GFDEBTN (Federal Debt), FYFSD (Federal Surplus/Deficit), RRPONTSYD (Reverse Repo)

---

### 4. Commodities Supercycle
**Thesis:** Structural commodity bull market driven by underinvestment and energy transition.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | DCOILWTICO | WTI Crude Oil | Energy benchmark |
| 2 | PPIACO | PPI All Commodities | Broad commodity prices |
| 3 | WPUFD49207 | PPI Metals | Industrial metals |
| 4 | INDPRO | Industrial Production | Demand driver |
| 5 | DTWEXBGS | Dollar Index (inverse) | Dollar weakness = commodity strength |

**Supplementary:** WPUIP2311 (PPI Energy), TCU (Capacity Utilization)

---

### 5. Credit Cycle Thesis
**Thesis:** Credit conditions drive economic cycles; monitoring for tightening/easing signals.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | BAMLH0A0HYM2 | High Yield OAS Spread | Credit stress indicator |
| 2 | DRTSCILM | C&I Loan Tightening | Bank lending standards |
| 3 | BUSLOANS | Commercial & Industrial Loans | Credit growth |
| 4 | TEDRATE | TED Spread | Interbank stress |
| 5 | TOTLL | Total Loans & Leases | Aggregate credit |

**Supplementary:** DRTSCLCC (Consumer Loan Tightening), CONSUMER (Consumer Credit), BAMLC0A0CM (IG Spread)

---

### 6. De-Dollarization Thesis
**Thesis:** Gradual shift away from USD dominance in global trade and reserves.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | DTWEXBGS | Trade-Weighted Dollar | Dollar strength |
| 2 | DTWEXAFEGS | Dollar vs Advanced Economies | Developed market view |
| 3 | FDHBFIN | Foreign Holdings of Treasuries | Reserve demand |
| 4 | GFDEBTN | Federal Debt Total | Debt sustainability |
| 5 | INTDSRUSM193N | Interest Payments | Debt service burden |

**Supplementary:** FYFSD (Federal Deficit), TREAST (Treasury Holdings)

---

### 7. Disinflation/Deflation Risk
**Thesis:** Risk of inflation falling below target or turning negative.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | CPIAUCSL | CPI All Urban | Headline inflation |
| 2 | CPILFESL | Core CPI | Underlying inflation |
| 3 | T5YIE | 5Y Breakeven Inflation | Market expectations |
| 4 | PCEPILFE | Core PCE | Fed's preferred measure |
| 5 | UMCSENT | Consumer Sentiment | Demand indicator |

**Supplementary:** PPIACO (Producer Prices), M2V (Money Velocity)

---

### 8. Dollar Milkshake Theory
**Thesis:** USD strengthens as global liquidity is absorbed into US assets.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | DTWEXBGS | Trade-Weighted Dollar | Primary indicator |
| 2 | DGS10 | 10Y Treasury Yield | Rate differentials |
| 3 | WALCL | Fed Balance Sheet | US liquidity |
| 4 | FDHBFIN | Foreign Treasury Holdings | Capital flows |
| 5 | RRPONTSYD | Reverse Repo | Excess liquidity |

**Supplementary:** DTWEXEMEGS (Dollar vs EM), BOGMBASE (Monetary Base)

---

### 9. Emerging Markets Growth Divergence
**Thesis:** EM growth outpaces developed markets due to demographics and reform.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | DTWEXEMEGS | Dollar vs Emerging Markets | EM currency strength |
| 2 | DTWEXBGS | Broad Dollar Index | Risk appetite proxy |
| 3 | BAMLHE00EHYIEY | EM Bond Spread | EM credit conditions |
| 4 | DCOILWTICO | Oil Price | Commodity exposure |
| 5 | FEDFUNDS | Fed Funds Rate | EM sensitivity to US rates |

**Supplementary:** INDPRO (Global demand proxy), T10Y2Y (Risk appetite)

---

### 10. Energy Transition Investment
**Thesis:** Massive capital reallocation toward clean energy infrastructure.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | PNFI | Private Nonresidential Investment | CapEx trend |
| 2 | IPG2211S | Utilities Production | Power sector activity |
| 3 | PERMIT | Building Permits | Infrastructure construction |
| 4 | INDPRO | Industrial Production | Manufacturing activity |
| 5 | DCOILWTICO | Oil Price | Traditional energy (inverse thesis) |

**Supplementary:** TCU (Capacity Utilization), MANEMP (Manufacturing Employment)

---

### 11. Fed Policy Pivot
**Thesis:** Federal Reserve shifts from tightening to easing monetary policy.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | DFEDTARU | Fed Funds Target Upper | Direct policy rate |
| 2 | WALCL | Fed Balance Sheet | QE/QT status |
| 3 | DGS2 | 2Y Treasury Yield | Rate expectations |
| 4 | T10Y2Y | 10Y-2Y Spread | Curve shape |
| 5 | RRPONTSYD | Reverse Repo | Liquidity conditions |

**Supplementary:** PCEPILFE (Inflation - policy driver), UNRATE (Employment - policy driver)

---

### 12. Fiscal Dominance
**Thesis:** Fiscal policy overwhelms monetary policy; deficit spending drives outcomes.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | GFDEBTN | Federal Debt Total | Debt level |
| 2 | FYFSD | Federal Surplus/Deficit | Deficit size |
| 3 | INTDSRUSM193N | Interest Payments | Debt service |
| 4 | DGS10 | 10Y Yield | Borrowing cost |
| 5 | WALCL | Fed Balance Sheet | Monetization risk |

**Supplementary:** FDHBFIN (Foreign Holdings), M2SL (Money Supply)

---

### 13. Global Liquidity Cycle
**Thesis:** Global central bank liquidity drives risk asset cycles.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | WALCL | Fed Balance Sheet | US liquidity |
| 2 | RRPONTSYD | Reverse Repo | Excess reserves |
| 3 | M2SL | M2 Money Supply | Broad money |
| 4 | WRESBAL | Reserve Balances | Banking system liquidity |
| 5 | BOGMBASE | Monetary Base | High-powered money |

**Supplementary:** TEDRATE (Interbank stress), BAMLH0A0HYM2 (Risk appetite via credit)

---

### 14. Hard Landing / Recession Risk
**Thesis:** Economic contraction risk from policy tightening or external shocks.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | T10Y2Y | 10Y-2Y Spread | Yield curve (recession predictor) |
| 2 | ICSA | Initial Jobless Claims | Labor market stress |
| 3 | UNRATE | Unemployment Rate | Labor market health |
| 4 | INDPRO | Industrial Production | Economic activity |
| 5 | UMCSENT | Consumer Sentiment | Demand outlook |

**Supplementary:** GDPC1 (Real GDP), PAYEMS (Payrolls), RSAFS (Retail Sales)

---

### 15. Higher for Longer Rates
**Thesis:** Interest rates remain elevated for extended period.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | DGS10 | 10Y Treasury Yield | Long-term rates |
| 2 | DFEDTARU | Fed Funds Target | Policy rate |
| 3 | PCEPILFE | Core PCE | Inflation persistence |
| 4 | T5YIE | 5Y Breakeven | Inflation expectations |
| 5 | UNRATE | Unemployment | Labor market tightness |

**Supplementary:** DGS30 (30Y Yield), T10Y2Y (Curve shape)

---

### 16. Housing Market Correction
**Thesis:** Housing prices decline due to affordability constraints and rate pressure.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | MORTGAGE30US | 30Y Mortgage Rate | Financing cost |
| 2 | HOUST | Housing Starts | New construction |
| 3 | PERMIT | Building Permits | Future supply |
| 4 | CSUSHPINSA | Case-Shiller Home Price | Price trend |
| 5 | HSN1F | New Home Sales | Demand indicator |

**Supplementary:** EXHOSLUSM495S (Existing Home Sales), RHORUSQ156N (Homeownership Rate)

---

### 17. Inflation Persistence
**Thesis:** Inflation remains sticky above target due to structural factors.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | PCEPILFE | Core PCE | Fed's target measure |
| 2 | CPILFESL | Core CPI | Alternative core |
| 3 | T5YIE | 5Y Breakeven | Near-term expectations |
| 4 | T10YIE | 10Y Breakeven | Long-term expectations |
| 5 | AHETPI | Avg Hourly Earnings | Wage inflation |

**Supplementary:** CPIUFDSL (Food CPI), CUSR0000SEHC (Shelter CPI), PCEPI (Headline PCE)

---

### 18. Japan Policy Normalization
**Thesis:** Bank of Japan exits ultra-loose policy, affecting global rates and yen.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | DEXJPUS | USD/JPY Exchange Rate | Yen strength |
| 2 | DGS10 | 10Y Treasury | Rate differential |
| 3 | WALCL | Fed Balance Sheet | Relative liquidity |
| 4 | FDHBFIN | Foreign Treasury Holdings | Japan treasury holdings |
| 5 | BAMLH0A0HYM2 | HY Spread | Risk appetite |

**Supplementary:** T10Y2Y (Curve shape), DTWEXBGS (Dollar Index)

---

### 19. Private Credit Expansion
**Thesis:** Private credit markets grow as banks retreat from lending.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | DRTSCILM | C&I Loan Tightening | Bank pullback |
| 2 | BUSLOANS | C&I Loans Outstanding | Bank lending trend |
| 3 | BAMLH0A0HYM2 | HY Spread | Public credit conditions |
| 4 | TOTLL | Total Loans & Leases | Aggregate credit |
| 5 | FEDFUNDS | Fed Funds Rate | Cost of capital |

**Supplementary:** CONSUMER (Consumer Credit), DRTSCLCC (Consumer Loan Standards)

---

### 20. Soft Landing
**Thesis:** Economy achieves moderate slowdown without recession.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | GDPC1 | Real GDP | Growth trajectory |
| 2 | UNRATE | Unemployment Rate | Labor stability |
| 3 | PCEPILFE | Core PCE | Inflation decline |
| 4 | PAYEMS | Nonfarm Payrolls | Job creation |
| 5 | T10Y2Y | Yield Curve | Recession signal absence |

**Supplementary:** INDPRO (Production), RSAFS (Retail Sales), UMCSENT (Sentiment)

---

### 21. Tech Sector Rotation
**Thesis:** Capital rotates from growth/tech to value/cyclicals.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | DGS10 | 10Y Yield | Duration sensitivity |
| 2 | T10Y2Y | Yield Curve | Economic cycle |
| 3 | INDPRO | Industrial Production | Cyclical activity |
| 4 | UMCSENT | Consumer Sentiment | Risk appetite |
| 5 | BAMLH0A0HYM2 | HY Spread | Credit conditions |

**Supplementary:** TCU (Capacity Utilization), MANEMP (Manufacturing Employment)

---

### 22. Treasury Market Dysfunction
**Thesis:** US Treasury market liquidity deteriorates; volatility spikes.

| Priority | Series ID | Name | Relevance |
|----------|-----------|------|-----------|
| 1 | DGS10 | 10Y Yield | Core Treasury rate |
| 2 | T10Y2Y | 10Y-2Y Spread | Curve volatility |
| 3 | TEDRATE | TED Spread | Funding stress |
| 4 | RRPONTSYD | Reverse Repo | Dealer capacity |
| 5 | WALCL | Fed Balance Sheet | Market maker of last resort |

**Supplementary:** FDHBFIN (Foreign Holdings), GFDEBTN (Supply pressure)

---

## Cross-Cutting Indicators

These indicators are relevant to multiple theses and should be monitored broadly:

### Macro Regime Indicators
| Series | Theses Count | Key For |
|--------|--------------|---------|
| DGS10 | 15+ | Rates, growth, equity |
| WALCL | 12+ | Liquidity, policy |
| DTWEXBGS | 10+ | Currency, commodities |
| T10Y2Y | 10+ | Cycle, recession |
| UNRATE | 9+ | Labor, recession |

### Inflation Cluster
| Series | Name | Use Case |
|--------|------|----------|
| CPIAUCSL | Headline CPI | Broad inflation |
| PCEPILFE | Core PCE | Fed target |
| T5YIE | 5Y Breakeven | Expectations |
| T10YIE | 10Y Breakeven | Long-term expectations |

### Liquidity Cluster
| Series | Name | Use Case |
|--------|------|----------|
| WALCL | Fed Balance Sheet | QE/QT |
| RRPONTSYD | Reverse Repo | Excess liquidity |
| M2SL | M2 Money Supply | Broad money |
| WRESBAL | Reserve Balances | Bank liquidity |

### Credit Cluster
| Series | Name | Use Case |
|--------|------|----------|
| BAMLH0A0HYM2 | HY OAS Spread | Credit stress |
| TEDRATE | TED Spread | Interbank stress |
| DRTSCILM | C&I Tightening | Lending standards |

---

## Integration Notes

### Current System State
- **Monitoring Script:** `scripts/daily-thesis-monitoring.ts`
- **Supported Series:** 34 FRED series currently configured
- **Auto-Trigger:** V&I points can be linked to thresholds via `thesis_monitoring_configs.explicit_thresholds`

### Adding New Series
1. Verify series exists at `https://fred.stlouisfed.org/series/{SERIES_ID}`
2. Add to `SUPPORTED_FRED_SERIES` in `daily-thesis-monitoring.ts`
3. Update thesis monitoring config via `/build-core-argument` skill or manually

### Threshold Configuration
```typescript
// Example explicit threshold in thesis_monitoring_configs
{
  "metric": "DGS10",
  "operator": ">",
  "value": 5.0,
  "linkedValidationPointId": "vp_123",
  "description": "10Y yield exceeds 5%"
}
```

### API Rate Limits
- FRED API: 120 requests/minute with API key
- Current implementation: Batches requests with delays
- Key stored in: `FRED_API_KEY` environment variable

---

## Appendix: All Supported FRED Series

Complete list of series IDs currently supported or recommended:

```
# Interest Rates
DGS2, DGS10, DGS30, T10Y2Y, T10Y3M, FEDFUNDS, DFEDTARU, MORTGAGE30US

# Inflation
CPIAUCSL, CPILFESL, PCEPI, PCEPILFE, T5YIE, T10YIE, PPIACO

# Labor Market
UNRATE, PAYEMS, ICSA, AHETPI, AWHMAN, MANEMP

# Output & Activity
GDPC1, INDPRO, TCU, DGORDER, RSAFS, IPMAN

# Credit & Spreads
BAMLH0A0HYM2, BAMLC0A0CM, TEDRATE, DRTSCILM, BUSLOANS, TOTLL

# Money & Liquidity
M2SL, WALCL, RRPONTSYD, BOGMBASE, WRESBAL, M2V

# Currency
DTWEXBGS, DTWEXAFEGS, DTWEXEMEGS, DEXJPUS

# Housing
HOUST, PERMIT, CSUSHPINSA, HSN1F

# Investment
PNFI, PRFI

# Fiscal
GFDEBTN, FYFSD, INTDSRUSM193N, FDHBFIN

# Sentiment
UMCSENT

# Energy
DCOILWTICO
```

---

*This document is auto-referenced by the `/build-core-argument` skill during thesis creation and monitoring config setup.*
