---
stage: 3
title: "Unknown Mapping"
source_thesis: "Advanced packaging (chiplets, 2.5D/3D) will capture disproportionate semiconductor value through 2028 as node scaling economics deteriorate"
created_at: "2026-01-21T13:00:00Z"
---

# Decision-Critical Unknowns: Advanced Packaging Value Shift

## All Unknowns (Ranked by Decision Impact)

1. **N2/18A cost-per-transistor trajectory** - HIGH impact
2. **Advanced packaging yield curves at scale** - HIGH impact
3. **TSMC vs OSAT value capture dynamics** - HIGH impact
4. **Chiplet adoption timeline in non-AI segments** - MEDIUM impact
5. **Substrate capacity expansion vs demand** - MEDIUM impact
6. **Hybrid bonding production readiness** - MEDIUM impact
7. **UCIe standardization momentum** - LOW impact
8. **Geopolitical supply chain risk** - LOW impact (already priced, binary)

---

## Top 3 Unknowns (Detailed Analysis)

### Unknown 1: N2/18A Cost-Per-Transistor Trajectory

**Decision Impact**: HIGH

This is the core premise of the thesis. If next-generation nodes (TSMC N2, Intel 18A) deliver cost-per-transistor improvements at historical rates, advanced packaging remains a niche premium solution rather than a structural shift.

**Resolution Type**: empirical

**Externally Resolvable**: partially

Direct cost data is confidential, but proxy indicators are available: foundry pricing announcements, customer design choices, industry analyst estimates, and company guidance on wafer starts.

**Kill Condition**:
- N2 wafer pricing comes in at <1.5x N3 pricing (historical node progression)
- Major AI chip designers (AMD, NVIDIA, hyperscalers) announce monolithic N2 designs over chiplet alternatives
- TSMC/Intel guide to continued cost-per-transistor improvement through 2028
- EUV high-NA demonstrates >80% yield within 18 months of introduction

**Conviction Increase Condition**:
- N2 wafer pricing exceeds 2x N3 pricing
- Major designers explicitly cite cost as reason for chiplet architecture
- Intel 18A delays or yield struggles continue
- Foundry CapEx guidance shifts toward packaging vs. leading-edge node expansion

**Recommended Sources**:
- TSMC quarterly earnings calls: Management commentary on N2 pricing and customer adoption
- Semiconductor industry analysts (Gartner, IDC, VLSI Research): Cost modeling reports
- AMD/NVIDIA architecture announcements: Design choice rationale
- ASML earnings calls: EUV high-NA tool shipments and customer feedback

**Estimated Effort**: 6 hours

**Research Queries**:
1. What is the projected N2 wafer price vs N3, and how does this compare to historical node transitions?
2. What are AMD and NVIDIA's announced roadmaps for monolithic vs chiplet architectures at N2?
3. What is TSMC's CapEx allocation between leading-edge node expansion vs advanced packaging capacity?

---

### Unknown 2: Advanced Packaging Yield Curves at Scale

**Decision Impact**: HIGH

Even if node economics favor packaging, the thesis fails if multi-die integration yields don't improve to production-viable levels. This determines whether advanced packaging can move beyond premium AI accelerators to mainstream products.

**Resolution Type**: empirical + industry

**Externally Resolvable**: partially

Exact yields are confidential, but proxy indicators exist: OSAT margin trends, equipment vendor commentary, customer testimonials, and analyst channel checks.

**Kill Condition**:
- CoWoS/Foveros yields reported below 75% after 2+ years in HVM
- OSATs report gross margin compression despite higher ASPs (yield losses dominate)
- Advanced packaging remains limited to >$500 ASP products through 2027
- Equipment vendors (Besi, KLA) report slower-than-expected order growth

**Conviction Increase Condition**:
- Amkor/ASE report gross margin expansion on advanced packaging
- Apple announces chiplet-based consumer products (iPhone, iPad)
- Intel/AMD report Foveros/chiplet yields at parity with monolithic
- Advanced packaging adoption expands to $100-300 ASP products

**Recommended Sources**:
- Amkor, ASE quarterly earnings: Margin commentary, revenue mix
- Apple supply chain analysis: Consumer chiplet adoption signals
- Equipment vendor earnings (Besi, AMAT, KLA): Order book trends, customer feedback
- DigiTimes, EE Times: Industry channel checks on packaging yields

**Estimated Effort**: 5 hours

**Research Queries**:
1. What are Amkor and ASE's gross margin trends on advanced packaging products vs traditional?
2. Are any consumer products (<$1000 retail) using 2.5D/3D packaging today, and what's the roadmap?
3. What do equipment vendors say about hybrid bonding yield learning curves?

---

### Unknown 3: TSMC vs OSAT Value Capture Dynamics

**Decision Impact**: HIGH

This is the execution risk for the thesis. The structural shift may be real, but if TSMC vertically integrates and captures all the value, the investable expression (OSATs, equipment, substrates) doesn't work.

**Resolution Type**: industry

**Externally Resolvable**: yes

Competitive dynamics are observable through capacity announcements, customer allocation, and margin trends.

**Kill Condition**:
- TSMC expands CoWoS capacity to meet >80% of AI packaging demand
- TSMC announces in-house substrate manufacturing or Besi competitor
- OSAT revenue growth but margin compression for 2+ consecutive years
- Major customers (NVIDIA, AMD) exclusive to TSMC packaging

**Conviction Increase Condition**:
- TSMC CoWoS remains capacity constrained, customers forced to OSATs
- Amkor/ASE win design-ins from NVIDIA, AMD, hyperscalers
- OSAT margins expand as capacity utilization increases
- TSMC focuses on leading-edge, cedes mainstream packaging to OSATs

**Recommended Sources**:
- TSMC investor presentations: Packaging capacity plans, vertical integration strategy
- Amkor/ASE earnings: Design win commentary, customer diversification
- NVIDIA/AMD supply chain disclosures: Packaging supplier allocation
- Industry news: Partnership announcements, capacity investments

**Estimated Effort**: 4 hours

**Research Queries**:
1. What is TSMC's announced CoWoS capacity expansion plan through 2028?
2. Have Amkor or ASE announced NVIDIA/AMD/hyperscaler design wins for advanced packaging?
3. What is TSMC's stated strategy on packaging - vertical integration or ecosystem partnership?

---

## Gate Assessment

**Decision**: advance

**Rationale**:

**High-impact resolvable unknowns exist**:
- All three top unknowns are HIGH impact - resolving any would significantly change conviction
- Unknown 1 (node economics) is partially resolvable through pricing data and design choices
- Unknown 2 (yield curves) is partially resolvable through margin data and adoption patterns
- Unknown 3 (value capture) is fully resolvable through competitive analysis

**Clear kill conditions defined**:
- Each unknown has specific, observable kill triggers
- Kill conditions are distinct from "thesis doesn't work" - they're leading indicators

**Research payoff is asymmetric**:
- ~15 hours of research to resolve decision-critical uncertainties
- Thesis covers multi-year structural shift with multiple investable expressions
- High-conviction position worth significant capital allocation if validated

**This thesis has EARNED research effort.** The unknowns are specific, resolvable, and decision-relevant. Resolving them would materially change position sizing and timing.

---

## Research Plan (if advancing)

**Priority Order**:
1. Unknown 3: TSMC vs OSAT dynamics - 4 hours (determines investable expression)
2. Unknown 1: N2/18A cost trajectory - 6 hours (validates core premise)
3. Unknown 2: Yield curves at scale - 5 hours (determines adoption breadth)

**Total Estimated Effort**: 15 hours

**Recommended Approach**:

Start with Unknown 3 (value capture) because it determines whether the thesis has a viable investment expression. If TSMC captures all value, the thesis may be right but uninvestable in public equities (outside TSMC itself).

Then tackle Unknown 1 (node economics) to validate the core premise. This is the structural foundation - if N2/18A economics are favorable, the thesis weakens regardless of other factors.

Finally, Unknown 2 (yields) determines the breadth of adoption - premium-only vs mainstream. This affects position sizing more than direction.

**Run research in this order**:
```
/research-unknown pipeline/idea-001-advanced-packaging-growth unknown-3 falsification
/research-unknown pipeline/idea-001-advanced-packaging-growth unknown-3 validation
/research-unknown pipeline/idea-001-advanced-packaging-growth unknown-1 falsification
/research-unknown pipeline/idea-001-advanced-packaging-growth unknown-1 validation
/research-unknown pipeline/idea-001-advanced-packaging-growth unknown-2 validation
```

Focus falsification tracks first to avoid confirmation bias.

---

## Next Step

Run `/research-unknown pipeline/idea-001-advanced-packaging-growth unknown-3 falsification` to begin Stage 4.
