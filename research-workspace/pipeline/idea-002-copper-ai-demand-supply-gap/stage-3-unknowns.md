---
stage: 3
title: "Unknown Mapping"
source_thesis: "AI-driven data center buildout will create a copper supply deficit by 2027, driving prices 30%+ higher as mine supply cannot respond in time."
created_at: "2026-01-21T00:00:00Z"
---

# Decision-Critical Unknowns: Copper AI Demand-Supply Gap

## All Unknowns (Ranked by Decision Impact)

1. **Data center copper intensity (tonnes/GW)** - HIGH impact
2. **Hyperscaler power buildout trajectory (GW/year 2025-2028)** - HIGH impact
3. **China copper demand trajectory (offsetting vs additive)** - HIGH impact
4. **Mine supply pipeline delivery risk (on-time vs delayed)** - MEDIUM impact
5. **Copper substitution threshold and timeline** - MEDIUM impact
6. **Miner cost inflation vs copper price gains** - MEDIUM impact
7. **Scrap/recycling supply elasticity** - LOW impact
8. **Resource nationalism risk (Chile, Peru, DRC)** - LOW impact

---

## Top 3 Unknowns (Detailed Analysis)

### Unknown 1: Data Center Copper Intensity

**Question**: How much copper does each GW of data center power capacity actually require?

**Decision Impact**: HIGH

This is the **demand multiplier** that converts power buildout (trackable) into copper demand (the thesis driver). If the number is 2,500 tonnes/GW, AI adds ~5 Mt over 5 years. If it's 1,000 tonnes/GW, the impact is halved and may not create a meaningful deficit.

**Resolution Type**: empirical

**Externally Resolvable**: partially
- Grid connection copper intensity is documented in utility filings
- Data center internal wiring estimates exist from contractors
- Transformer copper content is standardized
- BUT: total system-level intensity requires aggregation across components

**Kill Condition**:
If data center copper intensity is <1,500 tonnes/GW, the incremental AI demand (~2 GW/year data center additions) adds only ~3 Mt over 5 years - insufficient to create a deficit given ~1-2% annual supply growth. KILL thesis.

**Conviction Increase Condition**:
If intensity is >3,500 tonnes/GW AND grid upgrade requirements (substations, transmission) are additive, total copper demand from AI infrastructure could exceed 10 Mt by 2028. This would be transformational. INCREASE position size.

**Recommended Sources**:
- **Wood Mackenzie / CRU copper demand models**: Industry-standard forecasters with data center copper intensity estimates
- **Utility interconnection filings (ERCOT, PJM)**: Public filings show MW capacity + equipment specs
- **Data center contractor reports (DPR Construction, Holder)**: Construction cost breakdowns include copper
- **IEEE/IEC transformer standards**: Copper content by MVA rating is standardized

**Estimated Effort**: 4-6 hours

**Research Queries**:
1. What is the copper content per MVA of HV transformers used in data center grid connections?
2. What are typical grid infrastructure requirements (substation upgrades, transmission) per GW of data center load?
3. How much copper wiring is required per MW of data center IT load (internal distribution)?
4. Are there published copper intensity estimates from CRU, Wood Mackenzie, or ICSG for data centers specifically?

---

### Unknown 2: Hyperscaler Power Buildout Trajectory

**Question**: What is the actual pace of hyperscaler power capacity additions (GW/year) through 2028?

**Decision Impact**: HIGH

This is the **demand driver** itself. The thesis assumes massive buildout (~20-30 GW cumulative by 2028), but hyperscaler capex could slow if:
- AI ROI disappoints
- Power constraints (not copper) become binding
- Efficiency gains reduce buildout needs

**Resolution Type**: empirical + industry

**Externally Resolvable**: yes
- Hyperscalers (MSFT, GOOGL, AMZN, META) disclose capex in earnings
- Power Purchase Agreements (PPAs) are often announced
- Data center site announcements are tracked by industry analysts
- Utility IRP filings project load growth by customer segment

**Kill Condition**:
If hyperscaler capex guidance declines >20% YoY for two consecutive quarters, OR if announced data center projects are delayed/cancelled at scale (>30% of pipeline), the demand surge evaporates. KILL thesis.

**Conviction Increase Condition**:
If hyperscaler capex guidance increases AND new data center announcements accelerate (>10 GW of new projects announced in 2026), the buildout is tracking faster than modeled. INCREASE conviction.

**Recommended Sources**:
- **Hyperscaler earnings calls and 10-Ks** (MSFT, GOOGL, AMZN, META): Capex breakdowns, data center mentions
- **Synergy Research / Dell'Oro**: Data center capacity tracking by hyperscaler
- **Utility IRP filings**: PJM, ERCOT, Dominion project large load customer additions
- **Datacenter Dynamics / Data Center Frontier**: Industry publications tracking announcements

**Estimated Effort**: 3-4 hours

**Research Queries**:
1. What is the current aggregate hyperscaler data center power capacity (MW)?
2. What is the announced pipeline of new data center capacity through 2028?
3. How has hyperscaler capex guidance evolved over the past 4 quarters?
4. What are utility projections for data center load growth in key markets (Virginia, Texas, Arizona)?

---

### Unknown 3: China Copper Demand Trajectory

**Question**: Will China's copper demand decline (property weakness) offset or compound AI-driven demand growth?

**Decision Impact**: HIGH

China consumes ~55% of global copper. If property weakness releases 1-2 Mt/year of demand, it could fully offset AI-driven growth, delaying the deficit by 3-5 years. Conversely, if China stabilizes AND adds its own AI/EV demand, the deficit accelerates.

**Resolution Type**: empirical + industry

**Externally Resolvable**: partially
- China property starts/sales are tracked monthly
- China copper imports are published by customs
- SHFE inventory levels are public
- BUT: demand attribution (property vs grid vs EVs) requires estimation

**Kill Condition**:
If China copper imports decline >10% YoY for 3 consecutive months AND SHFE inventories rise >200kt from current levels, demand destruction is overwhelming AI additions. KILL thesis (or delay to 2029+).

**Conviction Increase Condition**:
If China copper imports remain flat-to-positive despite property weakness (indicating substitution to grid/EV demand) AND global inventories (LME+SHFE+COMEX) decline, the deficit is forming faster than expected. INCREASE conviction.

**Recommended Sources**:
- **China Customs data**: Monthly copper imports (refined + concentrate)
- **SHFE inventory reports**: Weekly inventory levels
- **China NBS data**: Property starts, completions, FAI in power grid
- **Antaike / SMM**: Chinese copper consultancies with demand breakdown

**Estimated Effort**: 3-4 hours

**Research Queries**:
1. What is the current trend in China copper imports (YoY, 3-month moving average)?
2. How have SHFE copper inventories moved over the past 6 months?
3. What is the estimated copper demand from China property vs grid vs EVs?
4. Are there signs of demand substitution from property to other sectors in China?

---

## Lower Priority Unknowns

### Unknown 4: Mine Supply Pipeline Delivery Risk [MEDIUM]

**Question**: Will major copper projects (Quellaveco, QB2, Oyu Tolgoi expansion, Kamoa-Kakula) deliver on time?

**Why MEDIUM**: Mine delays are common (~70% of projects delay), but this is more about **timing** than **direction**. Even if projects deliver on time, supply growth is only ~2-3%/year vs potentially 4-5% demand growth.

**Quick check**: Track quarterly production reports from major miners (FCX, BHP, Rio, Glencore, First Quantum).

---

### Unknown 5: Copper Substitution Threshold [MEDIUM]

**Question**: At what copper price does aluminum substitution become widespread in grid applications?

**Why MEDIUM**: Substitution is real but slow. Utilities have multi-year procurement cycles. Historical substitution threshold is ~$12,000/t (copper/aluminum ratio >3:1). We're currently below that.

**Quick check**: Monitor copper/aluminum price ratio. If it exceeds 3:1 for extended period, substitution risk rises.

---

### Unknown 6: Miner Cost Inflation [MEDIUM]

**Question**: Are miner costs rising faster than copper prices, compressing margins?

**Why MEDIUM**: This affects the **expression** (miner equities) not the thesis (copper deficit). If costs rise but copper rises faster, miners still benefit.

**Quick check**: Track all-in sustaining cost (AISC) trends in miner earnings vs copper price.

---

## Gate Assessment

**Decision**: advance

**Rationale**:

1. **Three HIGH-impact unknowns exist**, each capable of flipping the thesis:
   - Unknown 1 (copper intensity): The demand multiplier - if low, no thesis
   - Unknown 2 (hyperscaler buildout): The demand driver - if slowing, no thesis
   - Unknown 3 (China demand): The offset risk - if collapsing, deficit delayed

2. **All three are externally resolvable**:
   - Copper intensity: Partially resolvable via utility filings, industry reports, equipment specs
   - Hyperscaler buildout: Fully resolvable via earnings, filings, industry trackers
   - China demand: Partially resolvable via trade data, inventory data

3. **Clear kill conditions exist**:
   - Each unknown has specific, observable evidence that would invalidate the thesis
   - These are not vague "things could go wrong" - they're measurable thresholds

4. **Asymmetric payoff**:
   - Research effort: ~12-15 hours total
   - If thesis validated: 30%+ copper price move = significant alpha
   - If thesis killed: Avoid dead-end position, redeploy capital
   - Either outcome is valuable

**This idea has EARNED research effort.**

---

## Research Plan

**Priority Order**:
1. Unknown 2: Hyperscaler buildout trajectory - 3-4 hours
   - *Start here because it's most resolvable and most time-sensitive*
2. Unknown 1: Data center copper intensity - 4-6 hours
   - *The demand multiplier - determines magnitude of thesis*
3. Unknown 3: China demand trajectory - 3-4 hours
   - *The offset risk - determines timing of thesis*

**Total Estimated Effort**: 12-15 hours

**Recommended Approach**:

**Track A: Falsification (Unknown 2 + 3)**
- Test whether demand drivers are intact or weakening
- Look for disconfirming evidence first (hyperscaler capex slowing, China demand collapsing)
- If falsified, kill early and save effort

**Track B: Validation (Unknown 1)**
- Quantify the demand intensity number
- Aggregate from components (transformers, wiring, grid connections)
- This determines position sizing if thesis survives falsification

**Track C: Analogues**
- How did copper behave in previous demand shocks (China 2003-2008)?
- What was the supply response lag?
- This provides historical anchoring for price magnitude

---

## Next Step

Run `/stage-4a-research-unknown idea-002-copper-ai-demand-supply-gap unknown-2 falsification` to begin Stage 4 with the most decision-critical unknown.

Alternative: Run `/stage-4a-prep-desktop-research idea-002-copper-ai-demand-supply-gap` to generate a Claude Desktop Deep Research prompt for comprehensive research.
