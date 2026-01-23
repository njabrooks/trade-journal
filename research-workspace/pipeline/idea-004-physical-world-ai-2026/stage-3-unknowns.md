---
stage: 3
title: "Unknown Mapping"
source_thesis: "AI's value creation shifts from cloud training to physical deployment in 2026, driving hardware upgrade cycles across edge devices, power infrastructure, and embodied systems."
created_at: "2026-01-22T19:00:00Z"
---

# Decision-Critical Unknowns: Physical World AI Inflection

## All Unknowns (Ranked by Decision Impact)

1. **Edge AI capability trajectory vs cloud efficiency gains** - HIGH impact
2. **Device upgrade cycle timing and consumer purchase intent** - HIGH impact
3. **Value chain mapping: who captures margin in physical AI?** - HIGH impact
4. **BYOG power infrastructure adoption curve** - MEDIUM impact
5. **Autonomous vehicle regulatory timeline** - MEDIUM impact
6. **Geopolitical risk premium for Taiwan-exposed names** - MEDIUM impact
7. **Memory/packaging demand elasticity to edge AI** - LOW impact
8. **Humanoid robotics commercial timeline** - LOW impact

---

## Top 3 Unknowns (Detailed Analysis)

### Unknown 1: Edge AI Capability Trajectory vs Cloud Efficiency

**Decision Impact**: HIGH

This is the foundational question. If edge AI capability doesn't meaningfully improve OR if cloud inference costs fall faster than edge silicon improves, the entire thesis collapses. The shift from cloud to edge only happens if edge provides a compelling advantage (latency, privacy, cost, offline capability).

**Resolution Type**: technological / empirical

**Externally Resolvable**: yes

**Kill Condition**:
- MLPerf Mobile benchmark scores for on-device inference improve <15% YoY through mid-2026
- Cloud inference API costs (OpenAI, Anthropic, Google) decline >40% in 2026 while edge silicon costs remain flat
- Major app developers (Instagram, TikTok, Snapchat) continue routing >80% of AI calls to cloud through Q3 2026
- Qualcomm/MediaTek NPU performance gains decelerate vs prior generation launches

**Conviction Increase Condition**:
- MLPerf Mobile scores improve >30% YoY with new Snapdragon/Dimensity chips
- On-device LLMs achieve GPT-3.5 equivalent performance (evidenced by third-party benchmarks)
- Apple, Google announce on-device-first AI features that require latest hardware
- Developer surveys show >30% of AI workloads moving to on-device inference
- Latency-sensitive applications (real-time translation, AR) demonstrate clear edge advantage

**Recommended Sources**:
- **MLPerf Mobile benchmarks**: Official performance data, released semi-annually
- **Qualcomm AI Day / MediaTek presentations**: NPU roadmap and benchmark claims
- **Apple WWDC 2026**: On-device AI strategy, hardware requirements for AI features
- **App developer surveys** (State of Mobile, etc.): Where AI inference is happening
- **Cloud pricing pages**: Track OpenAI/Anthropic/Google API pricing trajectories
- **Academic papers**: On-device model compression, quantization advances

**Estimated Effort**: 6-8 hours

**Research Queries**:
1. What are the latest MLPerf Mobile inference benchmark scores and YoY improvement rates?
2. How have cloud AI inference API prices changed in the past 12 months, and what's the projected trajectory?
3. What specific AI features in iOS 19/Android 16 require on-device NPU vs can run on older hardware?
4. What percentage of AI API calls from major mobile apps are routed to cloud vs on-device?
5. What are Qualcomm's and MediaTek's NPU performance claims for 2026 chips vs 2025?

---

### Unknown 2: Device Upgrade Cycle Timing and Consumer Intent

**Decision Impact**: HIGH

Even if edge AI is capable, the thesis requires consumers and enterprises to actually BUY new devices. Smartphone upgrade cycles have elongated to 4+ years. PC refresh cycles are slow. If "AI" isn't a compelling purchase driver, the semiconductor demand surge doesn't materialize in 2026.

**Resolution Type**: empirical / industry

**Externally Resolvable**: yes

**Kill Condition**:
- Global smartphone shipments grow <3% in 2026 (per IDC/Gartner)
- PC shipments remain flat or decline despite "AI PC" marketing push
- Consumer surveys show "AI features" ranks below top 5 purchase criteria for phones/PCs
- Carrier subsidy programs for AI phones fail to drive upgrade acceleration
- Enterprise IT surveys show AI PC refresh delayed to 2027+ budgets

**Conviction Increase Condition**:
- Smartphone shipments grow >8% in 2026, with "AI phones" as defined category
- PC shipments grow >5% driven by AI PC category (IDC/Gartner attribution)
- Consumer surveys show >25% cite "AI features" as purchase consideration
- OEM earnings calls highlight AI as driving ASP increases and unit growth
- Enterprise surveys show AI PC refresh pulled forward to 2026 budgets

**Recommended Sources**:
- **IDC/Gartner/Counterpoint**: Quarterly shipment forecasts and actuals
- **Consumer survey data**: What drives phone/PC purchase decisions
- **OEM earnings calls**: Apple, Samsung, Lenovo, HP, Dell commentary on AI demand
- **Carrier promotional data**: Are carriers subsidizing AI phone upgrades?
- **Enterprise IT surveys** (Gartner, Forrester): PC refresh cycle intentions

**Estimated Effort**: 4-6 hours

**Research Queries**:
1. What are IDC/Gartner's 2026 smartphone and PC shipment forecasts, and how have they revised?
2. What percentage of consumers cite "AI features" as a top-3 reason for phone upgrade?
3. Are carriers offering differentiated subsidies for AI-capable phones?
4. What do enterprise IT surveys say about AI PC refresh timing and budget allocation?
5. What ASP premiums are OEMs achieving for "AI" branded devices?

---

### Unknown 3: Value Chain Mapping - Who Captures Physical AI Margin?

**Decision Impact**: HIGH

This is the execution risk. Even if physical AI happens on schedule, the investment returns depend on WHICH companies capture the value. If Apple captures it internally (not investable), or NVIDIA captures edge through Jetson (already priced), or TSMC is already at 25x P/E, the thesis may be correct but not actionable.

**Resolution Type**: industry / empirical

**Externally Resolvable**: partially

**Kill Condition**:
- Apple captures >60% of edge AI silicon value through internal A-series/M-series chips
- NVIDIA Jetson/automotive revenue grows >40% while QCOM IoT/Automotive grows <15%
- TSMC trades >28x forward P/E, pricing in edge AI scenario
- Second-order beneficiaries (ADI, TXN, ON) show no AI-related revenue acceleration
- Qualcomm's licensing revenue (not chip revenue) captures most of mobile AI value

**Conviction Increase Condition**:
- QCOM Automotive/IoT segments show >25% revenue growth with explicit AI attribution
- TSMC trades <22x forward with clear volume growth from edge diversification
- Analog/power names (ADI, TXN, ON, POWL) report AI-driven design wins in earnings
- New "physical AI" pure-plays emerge with clear investment case
- Value chain analysis shows margin expansion opportunity at overlooked nodes

**Recommended Sources**:
- **Company earnings calls/transcripts**: QCOM, TSM, ADI, TXN, ON, NVDA
- **Sell-side semiconductor analysts**: Value chain margin analysis
- **Company 10-Ks/20-Fs**: Segment revenue breakdown, especially QCOM IoT/Auto
- **Industry conferences** (CES, MWC): Who's announcing what partnerships
- **TSMC monthly revenue data**: Segment mix shifts

**Estimated Effort**: 8-10 hours

**Research Queries**:
1. What is QCOM's revenue breakdown by segment, and what's the growth trajectory for Automotive/IoT?
2. What is TSMC's current valuation vs historical range, and what's priced in?
3. Which analog/power semi companies have explicitly called out AI-related design wins?
4. How much of mobile AI silicon value is captured by Apple internally vs external suppliers?
5. What is NVIDIA's edge/embedded AI revenue and growth rate vs datacenter?

---

## Remaining Unknowns (Lower Priority)

### Unknown 4: BYOG Power Infrastructure Adoption [MEDIUM]
**Summary**: How fast does on-site power generation scale for AI workloads?
**Why lower priority**: Directionally supportive but not thesis-determining. Power thesis can be pursued separately if core edge AI thesis validates.
**Quick research**: Track announcements of SMR, natural gas, on-site solar for datacenters.

### Unknown 5: Autonomous Vehicle Regulatory Timeline [MEDIUM]
**Summary**: When does Tesla robotaxi get regulatory approval?
**Why lower priority**: One component of physical AI, not the whole thesis. Even if AV delays, edge devices (phones/PCs) can drive thesis.
**Quick research**: Track NHTSA, state DMV approvals, Tesla regulatory filings.

### Unknown 6: Taiwan Geopolitical Risk [MEDIUM]
**Summary**: What's the geopolitical risk premium for TSM exposure?
**Why lower priority**: Risk overlay on any Taiwan-exposed thesis, not specific to physical AI. Can be managed through position sizing or hedges.
**Quick research**: Monitor cross-strait tensions, export control announcements, TSMC Arizona progress.

---

## Gate Assessment

**Decision**: advance

**Rationale**:

**Why advance:**

1. **High-impact unknowns exist**: All three top unknowns would materially change conviction if resolved. Edge AI capability (Unknown 1) is foundational - if it fails, thesis dies. Upgrade timing (Unknown 2) determines whether returns materialize in 2026. Value chain (Unknown 3) determines whether thesis translates to actionable positions.

2. **Unknowns are externally resolvable**:
   - Unknown 1 (edge capability): MLPerf benchmarks, NPU specs, app developer behavior - all observable
   - Unknown 2 (upgrade cycles): IDC/Gartner data, consumer surveys, OEM earnings - empirical
   - Unknown 3 (value chain): Company filings, segment revenue, analyst reports - resolvable with effort

3. **Clear kill conditions exist**: Each unknown has specific, measurable criteria that would invalidate the thesis. This isn't a narrative-driven idea - it can be falsified.

4. **Asymmetric payoff**:
   - Research effort: ~20-25 hours total
   - Potential insight value: High if thesis validates with non-consensus beneficiary identification
   - The physical AI theme is acknowledged but not the dominant narrative (per original claim) - opportunity for differentiated positioning

5. **Timing is relevant**: The thesis is specific to 2026. Research done now can inform positioning before the theme fully plays out.

**Key risk**: Unknown 3 (value chain) is only "partially" resolvable - some of this is only knowable in hindsight. But the structural question (who can capture margin) is analyzable.

---

## Research Plan (if advancing)

**Priority Order**:
1. **Unknown 1**: Edge AI capability trajectory - 6-8 hours
   - Start here because it's foundational. If edge AI capability isn't advancing, stop.
2. **Unknown 2**: Device upgrade cycle timing - 4-6 hours
   - Second because even with capability, no demand = no thesis
3. **Unknown 3**: Value chain mapping - 8-10 hours
   - Last because it only matters if 1 and 2 validate

**Total Estimated Effort**: 18-24 hours

**Recommended Approach**:

1. **Falsification first**: Start Unknown 1 research looking for evidence AGAINST the thesis. If MLPerf scores are plateauing, if cloud costs are plummeting, if developers are cloud-first - stop early.

2. **Validation second**: If falsification fails (no strong counter-evidence), shift to validation track. Look for evidence that edge AI is crossing capability threshold.

3. **Parallel consumer data**: While doing technical research on Unknown 1, pull IDC/Gartner forecasts and consumer survey data for Unknown 2 - this is quick to gather.

4. **Value chain last**: Only dig into Unknown 3 if 1 and 2 are supportive. This is the most time-intensive research track.

---

## Stage 4 Research Commands (copy-paste ready)

Prioritized research sequence - run in order, stop early if falsification kills the thesis:

### 1. Unknown 1 Falsification (START HERE)
```
/stage-4a-prep-desktop-research idea-004-physical-world-ai-2026 unknown-1 falsification
```
*Can kill thesis early - look for evidence that edge AI capability is plateauing or cloud is winning*

### 2. Unknown 1 Validation
```
/stage-4a-prep-desktop-research idea-004-physical-world-ai-2026 unknown-1 validation
```
*Run if falsification doesn't kill - look for NPU improvement data, on-device AI feature adoption*

### 3. Unknown 2 Validation
```
/stage-4a-prep-desktop-research idea-004-physical-world-ai-2026 unknown-2 validation
```
*IDC/Gartner data, consumer surveys - quicker to gather, can run in parallel*

### 4. Unknown 3 Validation (ONLY IF 1 & 2 SUPPORT)
```
/stage-4a-prep-desktop-research idea-004-physical-world-ai-2026 unknown-3 validation
```
*Value chain/margin analysis - only worth doing if core thesis validates*
