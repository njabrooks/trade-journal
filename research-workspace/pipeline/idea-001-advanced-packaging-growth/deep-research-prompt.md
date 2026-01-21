# Deep Research Request: Advanced Packaging Thesis

**For use with Claude.ai Deep Research feature**

---

## Instructions for Claude

I need you to conduct deep research on three decision-critical unknowns for an investment thesis. For each unknown, run both **falsification** (find disconfirming evidence) and **validation** (find confirming evidence) tracks.

**Research Approach:**
- Prioritize primary sources (company filings, earnings transcripts, industry data)
- Be rigorous about falsification - I need to know what could prove this thesis wrong
- Note source credibility and potential biases
- Look for quantitative data where possible
- Flag contradictions rather than resolving them

---

## The Thesis

**Core Thesis (25 words):**
Advanced packaging (chiplets, 2.5D/3D) will capture disproportionate semiconductor value through 2028 as node scaling economics deteriorate, shifting CapEx and margins toward packaging infrastructure.

**Primary Economic Driver:**
Cost-per-transistor inflection point - when advanced packaging delivers equivalent compute improvement at lower total cost than the next node, value shifts structurally.

**Key Beneficiaries:** OSATs (Amkor, ASE), substrate suppliers (Ibiden), bonding equipment (Besi), EDA/IP (Cadence, Synopsys)

**Key Victims:** Pure-play foundries without packaging, traditional packaging, monolithic chip designers

---

## Unknown 1: N2/18A Cost-Per-Transistor Trajectory

**Why This Matters:**
This is the core premise. If next-gen nodes (TSMC N2, Intel 18A) deliver cost-per-transistor improvements at historical rates, advanced packaging remains niche rather than structural.

**Kill Condition (would invalidate thesis):**
- N2 wafer pricing at <1.5x N3 pricing
- Major AI chip designers choose monolithic N2 over chiplet alternatives
- TSMC/Intel guide to continued cost-per-transistor improvement through 2028
- EUV high-NA demonstrates >80% yield within 18 months

**Conviction Increase Condition:**
- N2 wafer pricing exceeds 2x N3
- Major designers explicitly cite cost as reason for chiplet architecture
- Intel 18A delays or yield struggles continue
- Foundry CapEx shifts toward packaging vs leading-edge

**Research Queries:**
1. What is the projected N2 wafer price vs N3, and how does this compare to historical node transitions?
2. What are AMD and NVIDIA's announced roadmaps for monolithic vs chiplet architectures at N2?
3. What is TSMC's CapEx allocation between leading-edge node expansion vs advanced packaging capacity?
4. What do industry analysts (Gartner, VLSI Research, IDC) estimate for cost-per-transistor trends?

**Recommended Sources:**
- TSMC quarterly earnings calls (2024-2026)
- AMD/NVIDIA investor presentations and architecture announcements
- ASML earnings calls on EUV high-NA
- Semiconductor industry analyst reports

---

## Unknown 2: Advanced Packaging Yield Curves at Scale

**Why This Matters:**
Even if node economics favor packaging, the thesis fails if multi-die integration yields don't improve. This determines whether advanced packaging moves beyond premium AI to mainstream.

**Kill Condition (would invalidate thesis):**
- CoWoS/Foveros yields below 75% after 2+ years in HVM
- OSATs report gross margin compression despite higher ASPs
- Advanced packaging limited to >$500 ASP products through 2027
- Equipment vendors report slower-than-expected orders

**Conviction Increase Condition:**
- Amkor/ASE report gross margin expansion on advanced packaging
- Apple announces chiplet-based consumer products
- Intel/AMD report chiplet yields at parity with monolithic
- Advanced packaging expands to $100-300 ASP products

**Research Queries:**
1. What are Amkor and ASE's gross margin trends on advanced packaging vs traditional?
2. Are any consumer products (<$1000 retail) using 2.5D/3D packaging, and what's the roadmap?
3. What do equipment vendors (Besi, AMAT, KLA) say about hybrid bonding yield curves?
4. What are reported or estimated CoWoS and Foveros yields in production?

**Recommended Sources:**
- Amkor, ASE quarterly earnings (margin commentary)
- Apple supply chain analysis
- Equipment vendor earnings (Besi, Applied Materials, KLA)
- DigiTimes, EE Times, SemiAnalysis channel checks

---

## Unknown 3: TSMC vs OSAT Value Capture Dynamics

**Why This Matters:**
This is the execution risk. The structural shift may be real, but if TSMC vertically integrates and captures all value, the investable expression (OSATs, equipment, substrates) doesn't work.

**Kill Condition (would invalidate thesis):**
- TSMC expands CoWoS to meet >80% of AI packaging demand
- TSMC announces in-house substrate or bonding equipment
- OSAT revenue growth but margin compression for 2+ years
- Major customers (NVIDIA, AMD) exclusive to TSMC packaging

**Conviction Increase Condition:**
- TSMC CoWoS remains capacity constrained, customers forced to OSATs
- Amkor/ASE win NVIDIA, AMD, hyperscaler design-ins
- OSAT margins expand with capacity utilization
- TSMC focuses on leading-edge, cedes mainstream packaging to OSATs

**Research Queries:**
1. What is TSMC's announced CoWoS capacity expansion plan through 2028?
2. Have Amkor or ASE announced NVIDIA/AMD/hyperscaler design wins?
3. What is TSMC's stated strategy - vertical integration or ecosystem partnership?
4. What are the competitive dynamics between TSMC InFO/CoWoS and OSAT offerings?

**Recommended Sources:**
- TSMC investor presentations and earnings calls
- Amkor, ASE earnings (customer commentary)
- NVIDIA/AMD supply chain disclosures
- Industry news on partnerships and capacity investments

---

## Output Format

For each unknown, please provide:

### Unknown {N}: {Title}

#### Falsification Track
**Key Findings:**
1. {Finding with source and credibility assessment}
2. {Finding}
3. {Finding}

**Kill Condition Assessment:** {triggered / not triggered / partially triggered}

#### Validation Track
**Key Findings:**
1. {Finding with source and credibility assessment}
2. {Finding}
3. {Finding}

**Conviction Increase Assessment:** {met / not met / partially met}

#### Track Summary
- **Overall conclusion:** {What the evidence suggests}
- **Confidence impact:** {strengthens / weakens / neutral / mixed}
- **Key uncertainties remaining:** {What we still don't know}

---

## Source Credibility Guide

| Source Type | Default Credibility | Notes |
|-------------|---------------------|-------|
| Company filings (10-K, earnings) | 0.8 | High, but watch for spin |
| Industry data (Gartner, VLSI) | 0.7 | Good, may lag reality |
| Expert opinion (analysts) | 0.5-0.7 | Varies by track record |
| Academic research | 0.7-0.9 | High rigor, may be dated |
| Media/news | 0.3-0.5 | Verify with primary sources |

---

## Final Synthesis Request

After researching all three unknowns, please provide:

1. **Overall Thesis Assessment:** Does the evidence support, contradict, or remain neutral on the core thesis?

2. **Confidence Update:** Based on evidence, should confidence increase, decrease, or stay the same from the prior of 0.70?

3. **Key Risks Identified:** What are the most significant risks revealed by research?

4. **Recommended Next Steps:** What additional research would be most valuable?

5. **Investable Expression:** Given TSMC value capture dynamics, which beneficiaries look most attractive?
