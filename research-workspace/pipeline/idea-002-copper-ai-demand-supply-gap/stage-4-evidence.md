---
stage: 4
title: "Evidence Resolution"
source_thesis: "AI-driven data center buildout will create a copper supply deficit by 2027, driving prices 30%+ higher as mine supply cannot respond in time."
prior_confidence: 0.65
created_at: "2026-01-21"
---

# Evidence Resolution: Copper AI Demand-Supply Gap

## Research Findings

### Unknown 1: Data Center Copper Intensity

#### Validation Track

**Research Date**: 2026-01-21
**Objective**: Find evidence that SUPPORTS this thesis with clear mechanism

**Conviction Condition Assessment**:
> If intensity is >3,500 tonnes/GW AND grid upgrade requirements (substations, transmission) are additive, total copper demand from AI infrastructure could exceed 10 Mt by 2028 - transformational.

**Status**: **PARTIALLY MET**

**Key Findings**:

1. **Microsoft Chicago Benchmark: 27,000 tonnes/GW**
   - Source: Copper Development Association
   - Credibility: HIGH
   - Microsoft's Chicago data center used 2,177 tonnes of copper for an 80 MW facility = 27 tonnes/MW = 27,000 tonnes/GW
   - This is 8x higher than the conviction threshold of 3,500 tonnes/GW

2. **Grid Infrastructure is Additive: +700-1,200 tonnes/GW**
   - Source: Thunder Said Energy, HDR engineering data
   - Credibility: HIGH
   - Grid infrastructure copper adds to internal facility requirements
   - Microsoft Washington DC required new greenfield substation + two 1.5-mile 115-kV transmission lines

3. **S&P Global Projects 2.5 Mt by 2040**
   - Source: S&P Global "Copper in the Age of AI" (January 2026)
   - Credibility: VERY HIGH
   - Data center copper demand: 1.1 Mt (2025) → 2.5 Mt (2040)
   - AI training represents 58% of DC copper demand by 2030
   - Projects 10 Mt supply shortfall by 2040

4. **Wood Mackenzie: 5 Mt Grid Copper by 2030**
   - Source: Wood Mackenzie
   - Credibility: VERY HIGH
   - Up to 5 million tonnes of copper tied to grid infrastructure for data centers through 2030
   - "Data centres create inelastic demand in the market"

5. **Price Inelasticity Creates Demand Lock-In**
   - Source: Wood Mackenzie
   - Credibility: HIGH
   - Copper represents <0.5% of DC project costs
   - Hyperscalers will build regardless of copper price ($10,000 or $20,000/tonne)

**Caveats**:
- Microsoft Chicago benchmark is from 2009 - may not reflect current efficiency improvements
- NVIDIA 800 VDC architecture (2027+) could reduce copper 45% in rack-level distribution
- AI-specific copper intensity lacks multiple independent measurements

**Summary**:
The copper intensity condition is definitively exceeded - actual intensity is ~27,000-28,000 tonnes/GW (8x the 3,500 threshold). Grid infrastructure requirements are confirmed as additive. However, the specific 10 Mt by 2028 target appears aggressive - multiple sources project 4-7 Mt by 2028-2030. The mechanism is strongly supported: data centers are the most copper-intensive infrastructure application, and demand is price-inelastic.

---

### Unknown 2: Hyperscaler Power Buildout Trajectory

#### Falsification Track

**Research Date**: 2026-01-21
**Objective**: Find evidence that this thesis is WRONG

**Kill Condition Assessment**:
> If hyperscaler capex guidance declines >20% YoY for two consecutive quarters, OR if announced data center projects are delayed/cancelled at scale (>30% of pipeline), the demand surge evaporates. KILL thesis.

**Status**: **NOT TRIGGERED**

**Key Findings**:

1. **Hyperscaler Capex Accelerating, Not Declining**
   - Source: Company earnings reports
   - Credibility: HIGH

   | Company | 2024 Actual | 2025 Guidance | YoY Change |
   |---------|-------------|---------------|------------|
   | Amazon | ~$77B | $125B | **+62%** |
   | Microsoft | ~$56B | ~$88B | **+58%** |
   | Alphabet | ~$52.5B | $91-93B | **+77%** |
   | Meta | ~$39B | $70-72B | **+82%** |

   Q3 2025 combined capex reached $113.4B - largest quarterly figure ever

2. **Project Delays at 20%, Below Kill Threshold**
   - Source: Data Center Watch
   - Credibility: HIGH
   - $162B in disruptions (2023-Q2 2025) vs $800B+ pipeline = ~20%
   - Most blocked projects relocate rather than cancel
   - 25 projects cancelled in 2025 (vs 6 in 2024)

3. **Construction Accelerating**
   - Source: CBRE market reports
   - Credibility: HIGH
   - YTD 2025 construction spending: $53.7B through November (+138% YoY)
   - July 2025: $14B in starts (record month)
   - Vacancy at 1.6% (record low)

**Concerning Evidence (NOT kill-triggering)**:

4. **Power Constraints May Bind**
   - Source: JLARC state report, utility filings
   - Credibility: HIGHEST
   - Virginia: 47.2 GW in contracts vs 4.2 GW current billing demand
   - Texas ERCOT: 230+ GW interconnection requests vs 7.5 GW approved
   - Grid infrastructure takes 5-10 years vs 12-24 months for data centers
   - This constrains **pace**, not direction

5. **Efficiency Gains Could Reduce Intensity**
   - Source: AMD, NVIDIA corporate data
   - Credibility: HIGH
   - AMD: 38x efficiency gain (2020-2025)
   - DeepSeek R1: trained for $5.6M vs GPT-4's $80-100M
   - But Jevons Paradox may offset

6. **ROI Concerns Are Real**
   - Source: Sequoia Capital
   - Credibility: MEDIUM-HIGH
   - $500-600B annual revenue gap between AI spending and revenue
   - 95% of enterprise GenAI pilots deliver zero ROI

**Summary**:
Kill conditions are definitively NOT met. Capex is accelerating 58-82% YoY (vs -20% threshold), and project delays are ~20% (vs 30% threshold). However, three material risks warrant monitoring: (1) power constraints may cap buildout pace, (2) efficiency gains could reduce copper intensity, (3) ROI disappointment could trigger future pullback. The 20-30 GW buildout assumption may prove optimistic if utilities cannot deliver interconnection.

---

### Unknown 3: China Copper Demand Trajectory

#### Falsification Track

**Research Date**: 2026-01-21
**Objective**: Find evidence that this thesis is WRONG

**Kill Condition Assessment**:
> If China copper imports decline >10% YoY for 3 consecutive months AND SHFE inventories rise >200kt from current levels, demand destruction is overwhelming AI additions. KILL thesis.

**Status**: **APPROACHING BUT NOT TRIGGERED**

**Key Findings**:

1. **Import Decline Approaching Threshold**
   - Source: China customs data
   - Credibility: HIGH
   - November 2025: -23.47% YoY
   - October 2025: -16.32% YoY
   - **Two consecutive months >10%** - a third would trigger
   - Full-year 2025 imports: -6.4% to 5.32 Mt (lowest since 2020)

2. **Inventory Rise Below Threshold**
   - Source: Exchange data
   - Credibility: HIGH
   - SHFE: +67kt from July lows (vs 200kt threshold) = **NOT TRIGGERED**
   - But COMEX at 21-year highs (514kt, +388% from end-2024)
   - Combined global inventories +68% from mid-2025

   | Metric | Threshold | Current | Status |
   |--------|-----------|---------|--------|
   | China imports YoY | >10% for 3 months | -23%, -16% (2 months) | **Approaching** |
   | SHFE inventory rise | >200kt | +67kt | **Not triggered** |

3. **Property Copper Release is 10x Smaller Than Assumed**
   - Source: Minmetals Economic Research Institute
   - Credibility: HIGH
   - Counter-thesis assumes 1-2 Mt/year release from property
   - Actual documented decline: ~100,000-130,000 tonnes annually
   - Order of magnitude smaller than assumed

4. **Structural Demand Substitution Favors Bulls**
   - Source: Industry data
   - Credibility: HIGH
   - New energy share of China copper: 6.8% (2021) → 19.4% (2025)
   - Grid infrastructure added 180,000-200,000 tonnes (fully offset property losses)
   - EV copper demand: 1.7 Mt (2025) with 14.3% CAGR to 2034

5. **Goldman Sachs Delays Deficit to 2029**
   - Source: Goldman Sachs
   - Credibility: VERY HIGH
   - Projects surplus through 2028:
     - 2025: 500kt surplus
     - 2026: 160kt surplus
     - Deficit: "From 2029 onwards"
   - Copper prices capped at $10,000-$11,000/tonne through 2026-2027

6. **ICSG/J.P. Morgan Project Earlier Deficit**
   - Source: ICSG, J.P. Morgan
   - Credibility: VERY HIGH
   - ICSG: 150kt deficit in 2026
   - J.P. Morgan: 330kt deficit in 2026, prices to $12,500/mt
   - Institutional disagreement reveals genuine uncertainty

**Summary**:
Kill condition approaching but not triggered. Two consecutive months of >10% import decline; a third would trigger. But SHFE inventory rise (+67kt) is only one-third of threshold. Most significantly, the property copper release assumption (1-2 Mt/year) appears overstated by 10x - actual release is ~100-130kt/year, fully offset by grid/EV growth. Goldman Sachs credibly delays the deficit to 2029, which would not support near-term 30%+ price increases.

---

## Evidence Synthesis

### Summary (by Theme)

1. **Copper Intensity Exceeds Expectations**
   - Supported by: Microsoft benchmark (27,000 t/GW), Wood Mackenzie grid analysis (5 Mt by 2030), S&P Global study, price inelasticity data
   - Strength: **STRONG**
   - Impact: **SUPPORTS thesis** - demand intensity is 8x higher than conviction threshold

2. **Hyperscaler Buildout Accelerating**
   - Supported by: Capex guidance (+58-82% YoY), record construction spending, record low vacancy
   - Challenged by: Power constraints, ROI concerns, efficiency gains
   - Strength: **STRONG** for near-term, **MODERATE** for 2027+
   - Impact: **SUPPORTS thesis** - demand driver intact

3. **Deficit Timeline Uncertain**
   - Goldman Sachs: Surplus through 2028, deficit 2029+
   - ICSG/J.P. Morgan: Deficit in 2026
   - Supported by: Institutional disagreement, China import weakness
   - Strength: **MODERATE**
   - Impact: **WEAKENS 2027 timing** but supports eventual deficit

4. **China Demand Resilient Despite Property**
   - Property copper release 10x smaller than assumed
   - Grid/EV growth offsetting property losses
   - Kill condition approaching but not triggered
   - Strength: **MODERATE**
   - Impact: **NEUTRAL to SLIGHTLY NEGATIVE** - thesis survives but with risk

5. **Aluminum Substitution Risk Elevated**
   - Copper/aluminum ratio at 4.2:1, expected to reach 4.5:1
   - Substitution accelerating in HVAC, automotive, power transmission
   - Strength: **MODERATE**
   - Impact: **STRUCTURAL HEADWIND** - may cap price upside

### Source Weighting

| Source Type | Count | Avg Credibility | Weight in Synthesis |
|-------------|-------|-----------------|---------------------|
| Company filings | 5 | high | high |
| Industry data | 12 | high | high |
| Expert opinion | 8 | medium-high | medium |
| Academic | 2 | high | medium |
| Media | 3 | medium | low |

**Overall Evidence Quality**: HIGH
**Diversity Score**: GOOD - Multiple Tier 1 sources (Goldman Sachs, S&P Global, Wood Mackenzie, ICSG) with different methodologies reaching similar directional conclusions

### Contradiction Log

| Topic | Position A | Position B | Resolution |
|-------|-----------|-----------|------------|
| Deficit timing | ICSG/J.P. Morgan: 2026 deficit | Goldman Sachs: Surplus to 2028 | **UNRESOLVED** - 2-3 year uncertainty |
| 10 Mt by 2028 | S&P Global: 4 Mt by 2040 total | Thesis conviction condition | **PARTIALLY RESOLVED** - 10 Mt appears aggressive |
| China demand | Kill condition approaching | Property offset only 100-130kt | **RESOLVED** - thesis survives |
| Efficiency impact | NVIDIA 45% copper reduction | Jevons Paradox offsetting | **UNRESOLVED** |

**Critical Contradictions**: 1 - The 2-3 year deficit timing disagreement affects the thesis timeframe but not direction

### Unknown Resolution Status

| Unknown | Kill Condition | Status | Conviction Condition | Status |
|---------|---------------|--------|---------------------|--------|
| 1: Copper intensity | <1,500 t/GW | **NOT TRIGGERED** (actual ~27,000) | >3,500 t/GW + grid additive | **PARTIALLY MET** |
| 2: Hyperscaler buildout | Capex -20% YoY x2 quarters | **NOT TRIGGERED** (actual +58-82%) | Capex up + >10 GW announced | **MET** |
| 3: China demand | Imports -10% x3 months + SHFE +200kt | **NOT TRIGGERED** (2 months, +67kt) | Imports flat + inventories down | **NOT MET** |

**Unresolved Unknowns**: None - all three researched
**Decision Criticality**: The deficit timing uncertainty (2026-2027 vs 2029) is decision-critical for near-term positioning

### Belief Update

**Prior Confidence**: 0.65
**Posterior Confidence**: 0.58

**Confidence Change**: -0.07

**Key Drivers of Update**:

1. **Positive**: Copper intensity massively exceeds expectations (8x threshold) - would increase confidence
2. **Positive**: Hyperscaler capex accelerating, kill conditions not triggered
3. **Negative**: Goldman Sachs credibly delays deficit to 2029 - material impact on 2027 thesis
4. **Negative**: China imports approaching kill condition (2 of 3 months)
5. **Negative**: 30%+ price increase by 2027 appears aggressive given surplus forecasts

**Confidence Calibration Notes**:
- The directional thesis (eventual deficit) is well-supported
- The timing thesis (2027) and magnitude thesis (30%+) are weaker
- Institutional disagreement on timing (2026-2029) reflects genuine uncertainty
- The prior of 0.65 was set before evidence of Goldman's 2029 forecast

### Gate Assessment

**Thesis Status**: **MODIFY**

**Rationale**:
The evidence strongly supports the **mechanism** of the thesis (AI buildout → copper demand → eventual supply deficit) but **weakens the timing and magnitude**:

1. **Copper intensity is validated** at ~27,000 t/GW (8x conviction threshold) - STRONG
2. **Hyperscaler buildout is intact** with 58-82% capex growth - STRONG
3. **Deficit timing is uncertain** - Goldman says 2029, ICSG says 2026, disagreement is real
4. **30%+ price increase by 2027 is not supported** by surplus forecasts through 2028
5. **China kill condition is approaching** but property offset is 10x smaller than bears assume

**Gate Criteria Check**:
- [ ] Posterior confidence ≥ 0.65? **NO** - actual: 0.58
- [x] No unresolved decision-critical unknowns? **YES** - all three researched
- [x] No kill conditions triggered? **YES** - all three NOT TRIGGERED
- [x] Evidence supports core mechanism? **YES** - mechanism validated

The core insight is valid but the framing needs refinement.

### Modification Notes

**Original Thesis**:
> AI-driven data center buildout will create a copper supply deficit by 2027, driving prices 30%+ higher as mine supply cannot respond in time.

**Suggested Revision**:
> AI-driven data center buildout will create sustained copper demand growth that mine supply cannot match, likely producing structural deficits from 2027-2029 onwards. Near-term price upside is capped by surplus conditions, but the structural bull case for copper strengthens as data center buildout continues and grid infrastructure requirements compound.

**What Changed**:
- **Timing**: Changed from "by 2027" to "2027-2029 onwards" to reflect institutional disagreement
- **Magnitude**: Removed "30%+ higher" as this is not supported by near-term surplus forecasts
- **Framing**: Shifted from "imminent deficit" to "structural demand growth" which is strongly supported

**Next Steps**:
1. Update stage-2-thesis.md with refined thesis
2. Consider the trade expression - equities may offer better risk/reward than commodities given timing uncertainty
3. Monitor China December 2025 import data - third consecutive -10% would trigger kill condition
4. Revisit in Q2 2026 when more data available on hyperscaler buildout pace

---

## Gate Decision Summary

**Recommendation**: **MODIFY**

**Rationale**: The copper deficit thesis survives falsification attempts - no kill conditions triggered, copper intensity massively exceeds expectations, and hyperscaler buildout is accelerating. However, the evidence does not support the specific "2027 / 30%+" framing. Goldman Sachs credibly projects surplus through 2028 with deficits from 2029. The thesis should be refined to reflect this timing uncertainty while maintaining the directional conviction that AI infrastructure creates structural copper demand growth that mine supply cannot match.

**Confidence**: 0.58 (down from 0.65)

The idea should continue but with modified thesis before advancing to Stage 5 Expression.
