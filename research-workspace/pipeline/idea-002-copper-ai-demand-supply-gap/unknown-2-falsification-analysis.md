# Falsification Analysis: Hyperscaler Power Buildout Trajectory

**The copper deficit thesis survives this investigation—but faces material risks from power constraints and efficiency gains that could reduce the scale of buildout below aggressive projections.**

The primary kill conditions are **not currently met**: hyperscaler capex is accelerating at 60-80% YoY (not declining >20%), and project cancellations represent ~20% of pipeline (below the 30% threshold). However, substantial evidence suggests the assumed **20-30 GW buildout may face significant headwinds** from grid infrastructure limitations and AI efficiency breakthroughs that warrant ongoing monitoring.

---

## Capex guidance shows acceleration, not decline

The kill condition requiring >20% YoY capex decline for two consecutive quarters is definitively **not met**. All four major hyperscalers have *raised* guidance:

| Company | 2024 Actual | 2025 Guidance | YoY Change |
|---------|-------------|---------------|------------|
| Amazon | ~$77B | $125B | **+62%** |
| Microsoft | ~$56B | ~$88B (FY25) | **+58%** |
| Alphabet | ~$52.5B | $91-93B | **+77%** |
| Meta | ~$39B | $70-72B | **+82%** |

Q3 2025 combined capex reached **$113.4 billion**—a 75% YoY increase and the largest quarterly figure ever recorded. The hyperscalers collectively hold **$747 billion in backlog** (Microsoft: $392B, Amazon: $200B+, Google: $155B), locking in future demand through 2027+.

**Microsoft's tactical pullback warrants monitoring.** TD Cowen reported Microsoft cancelled up to **2 GW of data center capacity** in early 2025, including walking away from pending leases in the US and Europe. However, this appears driven by OpenAI workloads shifting to Oracle/SoftBank's Stargate project rather than fundamental demand weakness. Microsoft *maintained* its $80B FY25 commitment and projects FY26 growth to "accelerate." Google and Meta scooped up freed capacity, suggesting demand reallocation rather than destruction.

**Source credibility:** HIGH (company earnings reports, investor presentations, Goldman Sachs research)

---

## Project delays reach 20% but fall short of kill threshold

Data center project disruptions totaled **$162 billion** from 2023 through Q2 2025, against an **$800+ billion** North American pipeline—approximately **20%**, below the 30% kill threshold. Critically, most blocked projects relocate rather than disappear:

- **25 projects cancelled in 2025** (vs. 6 in 2024, 2 in 2023)—representing 4.7 GW of avoided demand
- **$98 billion** in projects blocked or delayed in Q2 2025 alone
- Tract's $14B Arizona project was blocked at one site but relocated to Buckeye airport area

Construction activity is *accelerating*, not slowing. Year-to-date 2025 construction spending reached **$53.7 billion** through November—a **138% increase YoY**. July 2025 alone saw $14 billion in starts (record month), with 125 projects breaking ground through that period.

Peter Freed, former Meta Director of Energy Strategy, expects only **10% of announced projects** to reach completion. However, this reflects historical fallout rates for speculative projects, not demand collapse. Current vacancy rates at **1.6%** (record low) and **74% preleasing** suggest demand exceeds supply.

**Source credibility:** HIGH (Data Center Watch tracking, CBRE market reports, company announcements)

---

## Power constraints may bind buildout regardless of demand

This represents the **strongest evidence supporting thesis modification**—not a kill, but a potential cap on buildout pace. Grid infrastructure cannot match data center construction timelines:

**Virginia (Dominion Energy):**
- 47.2 GW in contracts vs. current 4.2 GW billing demand
- JLARC state report: *"Building enough infrastructure for unconstrained data center demand will be very difficult and meeting half that demand is still difficult"*
- Solar facilities would need to be added at **twice the 2024 rate**; wind generation needed exceeds **all secured offshore wind sites combined**
- Loudoun County eliminated by-right data center development; Dominion imposed "significantly reduced allocations" through January 2026

**Texas (ERCOT):**
- **230+ GW** of large load interconnection requests vs. only **7.5 GW** actually connected/approved
- ERCOT CEO: *"We're not going to allow the grid to grow to a capacity where it can't be operated reliably"*
- New regulations (S.B. 6) require data centers to accept mandatory curtailment during grid emergencies

**Arizona (APS):**
- APS Senior VP (November 2024): *"We do not have the energy and transmission infrastructure to support the amount of energy being requested. The utility cannot commit to serving them because it would put existing customers at risk"*
- 18-30 GW requested vs. 8.5 GW current capacity

**PJM Interconnection:**
- Time from application to commercial operation: **8+ years** (up from <2 years in 2008)
- Market monitor proposed: *"No more data centers unless they can be reliably served"*

**Critical timeline mismatch:** Data centers can be built in 12-24 months; grid infrastructure takes 5-10 years. This structural gap suggests copper demand may be constrained by power availability, not capital willingness.

**Source credibility:** HIGHEST (JLARC state government report, PJM/ERCOT grid operators, utility filings, named utility executives)

---

## Efficiency gains could reduce power intensity per workload

Evidence suggests efficiency improvements may substantially reduce power requirements per unit of AI compute, though Jevons Paradox (efficiency enabling more adoption) complicates projections:

**Hardware efficiency:**
- AMD exceeded its 30x25 goal with **38x efficiency gain** (2020-2025)—equivalent to **97% energy reduction** per AI training workload
- NVIDIA claims **10,000x efficiency gain** (2016-2025) with Blackwell delivering **25x performance-per-watt** improvement
- Epoch AI data shows AI chip efficiency improving **40% annually** (doubling every 2 years)

**Algorithmic efficiency (DeepSeek breakthrough):**
- DeepSeek R1 trained for **$5.6M** using 2,000 GPUs vs. GPT-4's **$80-100M** using 16,000 GPUs
- Uses Mixture-of-Experts activating only **37B of 671B parameters** per query—~95% compute reduction
- **11x more training efficient** than Meta Llama 3 (2.8M vs. 30.8M GPU hours)

**Cooling efficiency:**
- Industry PUE improved from **1.67 (2019) to 1.55 (2022)**, with hyperscalers achieving **1.09-1.15**
- AWS reported **46% reduction in mechanical energy consumption** with custom liquid cooling
- By 2027, over **50% of new hyperscale capacity** will be liquid cooled

**Combined impact:** If these compound, actual power requirements could be **50-80% lower** than projections based on 2023 technology assumptions.

**Source credibility:** HIGH (AMD/NVIDIA corporate sources, Epoch AI academic research, McKinsey/industry reports)

---

## ROI concerns present a timing risk for future capex

While not triggering current kill conditions, AI ROI disappointment could cause future capex pullbacks:

**Sequoia Capital's "$600B Question":**
- Identified **$500-600B annual revenue gap** between AI infrastructure spending and actual AI revenue
- OpenAI has largest share at ~$3.4B; *"Outside of ChatGPT, how many AI products are consumers really using?"*
- Compares to dot-com and telecom fiber overbuild

**Enterprise AI failure rates:**
- MIT NANDA study: **95% of enterprise GenAI pilots** deliver zero measurable ROI
- IBM research: **Only 25% of AI initiatives** delivered expected ROI over three years
- Gartner predicts **30% of GenAI projects abandoned** after proof-of-concept by end of 2025

**Wall Street skeptics:**
- Michael Burry: Put options >$1B against Nvidia/Palantir; claims hyperscalers understating depreciation by ~$176B (2026-2028)
- Goldman Sachs: Tech companies may get only **half the profit needed** to justify AI investment
- Bank of America: AI capex will consume **94% of operating cash flows** in 2025-2026

**Counter-evidence:** Current market fundamentals contradict oversupply concerns. North America vacancy at **1.6%** (record low), with 74% preleasing and lease rates up **19%** for large requirements. The infrastructure shortage appears real, even if long-term ROI remains uncertain.

**Source credibility:** MEDIUM-HIGH (Sequoia VC research, Goldman Sachs, consulting surveys—though survey methodology varies)

---

## Historical precedent: 1990s fiber overbuild parallel

Multiple analysts cite the 1990s telecom/fiber bubble as a cautionary precedent:
- Companies laid **80+ million miles of fiber optic cables** in the US
- **85-95% remained "dark"** (unused) four years after the bubble burst
- Global telecom stocks lost **$2+ trillion** in market value (2000-2002)
- Corning stock crashed from $100 (2000) to $1 (2002)

**Key distinction:** That infrastructure was eventually absorbed and became critical for streaming/cloud. AI data center assets may follow the same pattern—valuable long-term but devastating for early investors with aggressive timeline assumptions.

**Source credibility:** HIGH (historical fact documented across multiple sources)

---

## Kill condition assessment

| Condition | Threshold | Current Status | Assessment |
|-----------|-----------|----------------|------------|
| Capex guidance decline | >20% YoY for 2 consecutive quarters | +58-82% YoY (accelerating) | **NOT MET** |
| Project delays/cancellations | >30% of pipeline | ~20% ($162B of $800B+) | **NOT MET** |

**Overall assessment: NOT KILLED—but material caveats apply**

The thesis that AI-driven data center buildout will drive copper demand survives this falsification investigation. Hyperscaler capex is accelerating at historically unprecedented rates, project construction is setting records, and current data center vacancy is at all-time lows.

However, three significant risks warrant ongoing monitoring:

1. **Power constraints may cap buildout pace** regardless of demand. The 5-10 year grid infrastructure timeline vs. 12-24 month data center timeline creates a structural bottleneck. The assumed 20-30 GW cumulative buildout by 2028 may prove optimistic if utilities cannot deliver interconnection.

2. **Efficiency gains could reduce copper intensity per GW.** AMD's 38x efficiency improvement and DeepSeek's algorithmic breakthroughs suggest future data centers may require substantially less power per unit of AI capability. Jevons Paradox may offset this, but the relationship is uncertain.

3. **ROI disappointment could trigger future pullback.** The $600B revenue gap and 75-95% enterprise pilot failure rates create conditions for a 2027-2028 capex correction if hyperscalers fail to monetize AI investments.

---

## Caveats and limitations

- **Temporal limitation:** Most capex data reflects guidance through Q3 2025; material changes could occur in subsequent quarters
- **Microsoft pullback interpretation:** Whether tactical (OpenAI shift) or strategic (demand concerns) remains contested
- **Efficiency vs. demand:** Jevons Paradox complicates whether efficiency gains reduce or increase total power demand
- **Pipeline vs. execution:** Peter Freed's estimate that only 10% of announced projects complete suggests pipeline figures dramatically overstate actual buildout
- **Source conflicts:** Utility constraints vs. hyperscaler capex guidance create tension—either power availability will limit buildout or hyperscalers have visibility into solutions not yet public

---

## Conviction increase condition status

The conviction increase condition specified: *"If hyperscaler capex guidance increases AND new data center announcements accelerate (>10 GW of new projects announced in 2026)"*

**This condition appears to be tracking toward fulfillment:**
- All four hyperscalers raised 2025 guidance; all project 2026 acceleration
- Combined 2026 capex projected at **$600+ billion** (36% YoY growth)
- Construction starts in 2025 nearly tripled vs. 2024

However, physical power constraints may prevent announced capacity from materializing on projected timelines, creating a gap between financial commitment and operational delivery.