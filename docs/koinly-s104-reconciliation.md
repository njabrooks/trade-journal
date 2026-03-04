# Koinly S104 Reconciliation — TTC

Generated: 2026-03-04

## Summary

Reconciliation of our HMRC-standard UK Section 104 engine against Koinly's GBP CGT reports for Two Trees Capital (TTC). Tax year boundaries: May 1 – Apr 30 (TTC corporate reporting period).

### Aggregate Deltas

| Tax Year | Our Net Gain | Koinly Net Gain | Delta | Notes |
|----------|-------------|----------------|-------|-------|
| 2022/23 | -£191,466 | -£196,345 | +£4,879 | Close — residual is GBP pricing + event count differences |
| 2023/24 | -£337,375 | -£193,092 | -£144,282 | WIF B&B direction = -£118K of this |
| 2024/25 | -£37,437 | -£151,897 | +£114,461 | WIF B&B mirror = +£119K of this |

### Known Causes of Differences

#### 1. B&B Matching Direction (confirmed, Koinly bug)

Koinly matches disposals with **prior** acquisitions (backward). HMRC rules (TCGA 1992 s106A) require matching with **subsequent** acquisitions (forward, within 30 days). This shifts gains between tax years but conserves total gains across all years.

Confirmed via WIF reverse-engineering (see detail below). Affects every asset where B&B fires and buys/sells interleave.

#### 2. B&B Tax Year Boundary (confirmed, Koinly bug)

Koinly restricts B&B matching to the same UK tax year (Apr 6 – Apr 5). HMRC rules contain no such restriction. A disposal on Mar 30 should still match an acquisition on Apr 13 if within 30 days.

#### 3. FTX Futures Realized P&L (reconciliation script gap, not engine gap)

Koinly reports -£126K under "USD" in the 2022/23 CGT report. Cross-referencing with the complete tax report confirms these are **FTX futures realized P&L** (the Futures Summary section shows the identical -£126,331.58 figure, tagged "External gain" from the FTX wallet).

**Our engine correctly computes this.** The "Realized gain" tagged events are processed in the universal layer (average_cost_basis + gbp_conversion phases) before the S104 cost basis method runs. The full P&L is stored in `event_calculations.realized_gain_gbp` — our DB shows -£129,145 net (the ~£3K vs Koinly's -£126,332 is the expected GBP pricing variance).

These events are correctly excluded from S104 pooling — derivatives P&L should not be subject to share pooling rules. The delta appears in reconciliation because the **reconciliation script only aggregates `section_104_matches`**, missing the special event gains that sit in `event_calculations`.

For Corporation Tax purposes, crypto derivatives likely fall under the derivative contracts regime (CTA 2009 Part 7), which treats them as income rather than capital gains — so Koinly's categorisation under CGT may be the wrong tax bucket.

#### 4. GBP Pricing Differences (expected, ~0.3%)

Our engine uses exchange rate × USD price for GBP conversion. Koinly uses their internal price feed. Produces ~0.3% variance per transaction, visible as "close" status on most assets.

#### 5. Event Count Differences

We have more disposal events than Koinly in most years (e.g., 176 vs 152 in 2022/23). Some of our events have zero or near-zero gains (dust, fee-only transactions). Koinly may filter these from CGT reports.

---

## Per-Asset Deltas by Year

### 2022/23

| Asset | Our Gain | Koinly Gain | Delta | Status |
|-------|----------|------------|-------|--------|
| USD | -£129,145 | -£126,332 | -£2,813 | **close** (FTX futures P&L, reconciliation script gap) |
| USDC | £2,225 | -£3,040 | +£5,266 | discrepancy |
| ETH | -£44,192 | -£49,195 | +£5,003 | discrepancy |
| SOL | £8,647 | £10,862 | -£2,214 | discrepancy |
| CVXFXSFXS-F | £58,269 | £57,428 | +£841 | close |
| CVXCRV | -£45,094 | -£44,739 | -£355 | close |
| FXS | £2,944 | £3,251 | -£307 | close |
| CRV | -£29,545 | -£29,271 | -£275 | close |
| Others | small | small | < £250 each | close/match |

### 2023/24

| Asset | Our Gain | Koinly Gain | Delta | Status |
|-------|----------|------------|-------|--------|
| **WIF** | **£45,222** | **£163,079** | **-£117,857** | **B&B direction** |
| BONK | £64,357 | £74,031 | -£9,673 | B&B direction (likely) |
| USDC | -£25,642 | -£17,908 | -£7,734 | discrepancy |
| SHDW | £7,747 | £13,204 | -£5,457 | discrepancy |
| RBASIS | -£344,436 | -£339,220 | -£5,216 | close |
| CRVUSD | -£1,066 | -£2,971 | +£1,906 | discrepancy |
| SOL | -£1,665 | -£2,831 | +£1,166 | discrepancy |
| CVX | -£57,225 | -£56,510 | -£715 | close |
| Others | various | various | < £500 each | close/match |

### 2024/25

| Asset | Our Gain | Koinly Gain | Delta | Status |
|-------|----------|------------|-------|--------|
| **WIF** | **-£116,010** | **-£234,662** | **+£118,652** | **B&B mirror** |
| HYPE | -£15,474 | £26,020 | -£41,494 | discrepancy (investigate) |
| USDC | £2,152 | -£12,396 | +£14,547 | discrepancy |
| BONK | £340,643 | £328,887 | +£11,756 | B&B mirror (close) |
| SOL | -£12,766 | -£23,222 | +£10,456 | discrepancy |
| MSOL | £50,254 | £51,957 | -£1,703 | close |
| JITOSOL | £26,315 | £27,717 | -£1,402 | discrepancy |
| SUI | -£189,938 | -£190,979 | +£1,041 | close |
| Others | various | various | < £600 each | close/match |

---

## WIF Deep Dive — B&B Direction Proof

### Koinly UI Labels (verified from screenshots)

| Date | Label | Qty | CB | Gain |
|------|-------|-----|----|----- |
| Mar 6 | Bnb rule pool | -22,992 | £28,088 | £9,167 |
| Mar 16 | Bnb rule pool | -1,000 | £1,331 | £753 |
| Mar 30 | Section 104 pool | -18,060 | £14,369 | £50,194 |
| Apr 5 | Section 104 pool | -58,875 | £46,842 | £102,965 |
| Jun 21 | Bnb rule pool + Section 104 pool | -71,800 | £149,356 | -£48,330 |
| Feb 24 | Section 104 pool | -129,251 | £247,713 | -£186,332 |

### Proof of Backward B&B

- **Jun 21 SELL**: B&B portion = 23,491.94 WIF at £39,914.87 — matches **exactly** to Jun 20 BUY (1 day **before**). Qty and cost match to the penny.
- **Mar 16 SELL**: B&B cost/unit = £1.33138 — matches **exactly** to Mar 7 BUY Rcvd CB/unit (9 days **before**).
- Under correct HMRC forward matching, Jun 21 should match Jun 25 BUY (4 days after), and Mar 16 should match Apr 13 BUY (28 days after).

### Our Engine vs Koinly (WIF transaction-level)

| Date | Our CB | Koinly CB | Delta | Cause |
|------|--------|-----------|-------|-------|
| Mar 6 | £34,165 | £28,088 | +£6,078 | Forward B&B (Mar 7+18) vs backward (Mar 4-5) |
| Mar 16 | £2,259 | £1,332 | +£927 | Forward B&B (Apr 13a) vs backward (Mar 7) |
| Mar 30 | £40,787 | £14,369 | +£26,419 | Forward B&B (Apr 13a) vs pure pool |
| Apr 5 | £131,117 | £46,842 | +£84,274 | Forward B&B (Apr 13-May 5) vs pure pool |
| Jun 21 | £104,190 | £149,356 | -£45,166 | Forward B&B (Jun 25+Jul 4) vs backward (Jun 20) |
| Feb 24 | £174,689 | £247,713 | -£73,024 | Pool cost difference from above |

### Conservation

Total WIF delta across both years: -£117,857 + £118,652 = **+£795** (rounding only). Confirms the B&B direction only shifts gains between years, not the total.

### Additional CSV Export Finding

Koinly's CSV `Received Cost Basis` column aggregates blank-Rcvd-CB events into adjacent rows:
- Mar 4a Rcvd CB (£31,601) = Mar 4a Net Value (£19,752) + Mar 4b Net Value (£11,849)
- Apr 13a Rcvd CB (£57,752) = Apr 13a Net Value (£49,759) + Apr 13b Net Value (£7,993)
- True per-event cost = Net Value column

---

## Koinly Support Ticket

Raised with Koinly AI customer service on 2026-03-04. Reported:
1. B&B matching direction (backward vs forward) — with screenshot evidence
2. Requested escalation to development team

Awaiting response from dev team.

---

## Our Engine Status

Our S104 engine correctly implements:
- Forward B&B matching (disposal → acquisitions in next 30 days)
- FIFO matching order within the 30-day window
- No tax year boundary restriction on B&B
- Standard S104 pool with average cost basis

S104 logic is correct per HMRC rules. No changes needed to the pooling/B&B engine.

### Reconciliation Script Gap

The reconciliation script (`reconcile-koinly.ts`) only aggregates `section_104_matches` records. Special events (futures P&L, fees, transfers) have their realized gains stored in `event_calculations.realized_gain_gbp` but are not included in the reconciliation totals. This explains the USD "engine gap" that was originally reported — the engine computes the gains correctly, the script just doesn't surface them.
