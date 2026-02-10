---
stage: 4
title: "Evidence Resolution"
source_thesis: "Space-based AI compute will achieve lower cost-per-FLOP than terrestrial alternatives within 36 months, driven by 10x solar economics and uncapped power scalability."
prior_confidence: 0.90
created_at: "2026-02-10T00:00:00Z"
---

# Evidence Resolution: Space-Based AI Compute Economics

## Research Findings

### Unknown 3: Starship Reuse Cadence and Achieved $/kg

#### Falsification Track

**Research Date**: 2026-02-10
**Objective**: Find evidence that this thesis is WRONG

**Kill Condition Assessment**:
> By end of 2027: Starship has not achieved booster reuse, OR achieved reuse cadence is under 10 flights per booster, OR FAA has imposed flight rate caps below 50/year from Boca Chica.

**Status**: PARTIALLY TRIGGERED (high confidence)

**Findings**:

- SpaceX achieved only 5 Starship flights in 2025 vs. 25-flight target (80% miss)
  - Source: cross-referenced flight manifest data
  - Credibility: high
  - Bearing: Vehicle achieving ~4 flights/year cannot reach required cadence

- No Starship upper stage has ever been recovered — ship reuse entirely undemonstrated
  - Source: factual flight record
  - Credibility: high
  - Bearing: Critical — ship reuse is the key to sub-$200/kg economics

- Booster reuse turnaround demonstrated at 4.5 months, not hours (60× gap to conviction condition)
  - Source: observable flight dates
  - Credibility: high
  - Bearing: Strongly supports kill condition

- V3/Block 3 booster failed ground pressure testing (Nov 2025), resetting development clock
  - Source: observed anomaly
  - Credibility: high
  - Bearing: "Production vehicle" has never flown

- FAA caps Boca Chica at 25 launches/year — already below 50/year kill threshold
  - Source: official FAA documents
  - Credibility: high
  - Bearing: Kill condition component already triggered

- Cape Canaveral infrastructure years behind — LC-39A late 2026, SLC-37 not before 2028
  - Source: observable construction progress
  - Credibility: high
  - Bearing: Realistic combined capacity through end-2027 is ~25-30 flights/year

- Falcon 9 took 12 years to reach 50+ flights/year — most relevant historical precedent
  - Source: complete public flight manifest
  - Credibility: high
  - Bearing: Devastating to 36-month timeline

- Space Shuttle promised 60 flights/year at $5.5M — delivered 4.5/year at $1.6B
  - Source: official NASA cost data
  - Credibility: high
  - Bearing: Strongest historical analogue for reusable vehicle cost/cadence overruns

- Independent analysts estimate $1,000-2,500/kg for foreseeable future (5-12× above thesis threshold)
  - Source: SpaceDotBiz, Longshot Space
  - Credibility: medium-high
  - Bearing: Strongly supports falsification

- Raptor engine failures caused multiple vehicle losses — 33 engines create compounding risk
  - Source: observed flight anomalies
  - Credibility: high
  - Bearing: Even 99% per-engine reliability yields ~67% zero-failure probability per flight

- NASA safety panel assessed Starship HLS as "significantly challenged" and "could be years late"
  - Source: official NASA ASAP assessment
  - Credibility: high
  - Bearing: Independent credibility test on SpaceX timeline projections

- Block 2 reusable payload was only 35 tonnes — far below 100-200t needed for low $/kg
  - Source: industry analysis
  - Credibility: medium-high
  - Bearing: $/kg math is extremely sensitive to actual payload mass

**Caveats**: SpaceX is private (no internal cost data); V3 may perform dramatically better than V2; political environment favors SpaceX

---

### Unknown 2: GPU/Accelerator Survival Duration in LEO Radiation

#### Falsification Track

**Research Date**: 2026-02-10
**Objective**: Find evidence that this thesis is WRONG

**Kill Condition Assessment**:
> Commercial electronics in LEO experience failure rates requiring replacement within 12-18 months. Alternatively, radiation testing data on modern 3-5nm chips shows SEU rates unacceptable for AI training.

**Status**: PARTIALLY TRIGGERED (medium-high confidence)

**Findings**:

- Starlink achieves ~5.3-year median lifetime with zero confirmed radiation-caused failures
  - Source: Jonathan McDowell tracking data, Kaplan-Meier analysis
  - Credibility: high
  - Bearing: AGAINST kill condition — COTS electronics survive LEO

- SpaceX deploys COTS electronics with TMR and confirms adequate radiation margin at 550km
  - Source: SpaceX IEEE TNS paper (2024)
  - Credibility: high
  - Bearing: AGAINST kill condition — software mitigation works for communication tasks

- 5nm FinFET SEU cross-section is 10× worse than 7nm — unprecedented reversal at exactly H100's node
  - Source: Vanderbilt University (premier radiation effects group), peer-reviewed IEEE TNS
  - Credibility: high
  - Bearing: FOR kill condition — worst possible technology node for radiation vulnerability

- FinFET technology shows increased single-event latchup sensitivity — can permanently destroy GPUs
  - Source: Vanderbilt + Sandia National Labs; NVIDIA Xavier and AMD Ryzen both showed destructive SEL
  - Credibility: high
  - Bearing: FOR kill condition — hardware-killing failure mode, not software-recoverable

- NASA COTS GPU testing shows functional interrupts every ~43 days in LEO radiation
  - Source: NASA Co-60 and particle beam testing
  - Credibility: high
  - Bearing: FOR kill condition — would disrupt multi-week training runs

- Google TPU radiation testing shows commercial AI chips can survive shielded LEO for 5 years
  - Source: Google original proton beam testing
  - Credibility: high
  - Bearing: AGAINST kill condition — strongest counter-evidence for TID survivability

- Estimated ~640,000 bit flips/day in H100-class memory in LEO; 20% are multi-bit upsets
  - Source: in-orbit measurement data (Alsat-1), extrapolated
  - Credibility: medium-high (extrapolation from older SRAM)
  - Bearing: FOR kill condition — 128,000 uncorrectable errors/day per GPU

- Silent data corruption already occurs weekly during Earth-based AI training at scale
  - Source: Meta, Google, Adept AI, NVIDIA first-hand reports
  - Credibility: high
  - Bearing: FOR kill condition — LEO would amplify SDC by orders of magnitude

- Combined error-correction overhead reduces effective throughput to ~15-25% of nominal
  - Source: ESA technical docs, ACM papers, industry analysis
  - Credibility: high
  - Bearing: FOR kill condition — 4-7× throughput penalty destroys economics even if hardware survives

- No radiation-hardened GPU exists; rad-hard processors are 5-10 generations behind
  - Source: SpaceNews, NASA official sources
  - Credibility: high
  - Bearing: FOR kill condition — no alternative path within 36 months

**Caveats**: No H100/A100 radiation data exists publicly; 640K bit-flips/day is extrapolated from older tech; Google TPU test counterbalances but tested TID, not SEU during sustained compute; Starcloud-1 at 325km (lower radiation) with only 11-month mission

---

### Unknown 1: All-In $/FLOP Crossover Economics

#### Validation Track

**Research Date**: 2026-02-10
**Objective**: Find evidence SUPPORTING the thesis with clear mechanism

**Conviction Condition Assessment**:
> Credible third-party analysis shows space compute reaching cost parity under conservative assumptions. Alternatively, SpaceX or any hyperscaler announces a space compute pilot program with published economics.

**Status**: PARTIALLY MET (medium confidence)

**Findings**:

- SpaceX filed for 1 million orbital DC satellites; merged with xAI for $1.25T explicitly pursuing orbital compute
  - Source: FCC filing, financial transaction
  - Credibility: high
  - Mechanism: Strongest possible market signal — vertical integration creates captive demand

- Google Project Suncatcher: first hyperscaler techno-economic analysis showing parity at ≲$200/kg
  - Source: Google Research, co-authored by DeepMind leadership
  - Credibility: high
  - Mechanism: Identifies $200/kg as threshold — projects achievable by mid-2030s (not 36 months)

- Starcloud publishes bottom-up cost model showing 20× energy cost advantage
  - Source: startup white paper; NVIDIA-backed; H100 operating in orbit
  - Credibility: medium (aggressive assumptions: $0.03/W solar, $30/kg launch)
  - Mechanism: Directional advantage real but excludes ~$24B in common costs

- Terrestrial power is the binding constraint — 5-7 year grid interconnection delays, 833% capacity price surge
  - Source: IEEFA, McKinsey, PJM auction data
  - Credibility: high
  - Mechanism: "Why now" — terrestrial costs are rising, not just space costs falling

- McCalip (Varda Space) model: 2.1× cost gap at $1,000/kg, narrows to parity at ~$200/kg
  - Source: public calculator from space manufacturing practitioner
  - Credibility: medium-high
  - Mechanism: Launch cost is the single dominant variable; vertical integration is "the whole ballgame"

- Multiple well-funded entities deploying real capex (Google, Aetherflux, Axiom, Starcloud, Schmidt, Altman, Bezos)
  - Source: disclosed funding rounds and hardware deployments
  - Credibility: high
  - Mechanism: Independent convergence suggests internal models show viability

- Solar physics advantage confirmed at 5-8× energy yield per panel
  - Source: established physics, confirmed by Google, Starcloud, NSS
  - Credibility: high
  - Mechanism: Foundational — not speculative

- Starship cost trajectory: credible path from ~$1,500/kg today toward $100-200/kg within 3-5 years (not 36 months)
  - Source: Citi, Bain, Payload Research, NextBigFuture
  - Credibility: medium-high
  - Mechanism: Learning curve is real but timeline is 5-8 years to threshold

- TPU and GPU radiation data shows commercial chips can survive LEO 5+ years
  - Source: Google, NASA
  - Credibility: high
  - Mechanism: Removes rad-hard premium objection

- Orbital DC market projected at $39B by 2035 (67% CAGR)
  - Source: market analysis (multiple independent analysts)
  - Credibility: medium
  - Mechanism: Institutional consensus on multi-billion-dollar market

**Caveats**: No complete all-in $/FLOP comparison published; 36-month timeline not supported by any credible third party (Google says mid-2030s, Deutsche Bank "well into 2030s"); Starcloud model excludes most costs; AWS CEO says "just not economical"; terrestrial alternatives also improving

---

## Evidence Synthesis

### Summary (by Theme)

1. **The physics mechanism is real and confirmed**
   - Solar 5-8× advantage in orbit is established physics (not disputed by any source)
   - Terrestrial power is genuinely constrained (5-7yr grid delays, 833% capacity price surges)
   - Commercial AI chips can physically survive LEO radiation for 5+ years (Google TPU, Starlink proxy)
   - Supported by: Findings across all three unknowns
   - Strength: **strong**

2. **The timeline is wrong — parity is 5-8 years away, not 3**
   - Starship has achieved 5 flights in 2025 vs. 25 target; no ship reuse; V3 hasn't flown
   - Google projects parity by mid-2030s; Deutsche Bank "well into 2030s"
   - FAA caps Boca Chica at 25/yr; multi-site operations not before 2027-2028
   - Falcon 9 took 12 years to reach 50+ flights/yr; Shuttle missed cadence by 13×
   - Independent analysts project $1,000-2,500/kg for foreseeable future
   - Supported by: Unknown 3 falsification (12 findings), Unknown 1 validation caveats
   - Strength: **strong**

3. **Radiation creates a throughput penalty that undermines the economic case**
   - 5nm SEU rates are 10× worse than 7nm (unprecedented) — exactly where H100 sits
   - Destructive latchup demonstrated in both NVIDIA and AMD GPU SoCs
   - ~640,000 bit flips/day extrapolated; SDC already weekly in terrestrial training
   - Error correction overhead: 4-7× throughput reduction (TMR + ABFT + checkpointing)
   - Energy is only ~15% of DC TCO; chips are ~70% — free solar can't compensate for 4-7× throughput penalty
   - Supported by: Unknown 2 falsification (10 findings)
   - Strength: **strong** (but with notable counter-evidence from Google TPU test)

4. **Smart money is betting on the direction, not the Musk timeline**
   - Google, SpaceX/xAI, Aetherflux, Axiom, Starcloud, Bezos, Schmidt, Altman all investing
   - But Google says mid-2030s, not 36 months
   - McCalip model shows 2.1× gap today, closing toward parity at $200/kg
   - Real hardware in orbit (Starcloud H100, Axiom nodes) — but at demo scale, not economic scale
   - Supported by: Unknown 1 validation (10 findings)
   - Strength: **moderate** (direction validated, timeline invalidated)

5. **Vertical integration may be the decisive enabler — but only for SpaceX**
   - McCalip: vertical integration is "the whole ballgame"
   - SpaceX-xAI merger creates only entity controlling launch + compute demand
   - No other entity can replicate this cost structure
   - Supported by: Unknown 1 validation
   - Strength: **moderate** (structural insight, but doesn't fix timeline)

### Source Weighting

| Source Type | Count | Avg Credibility | Weight in Synthesis |
|-------------|-------|-----------------|---------------------|
| Company filings/data | 8 | high | high |
| Industry reports/analysis | 10 | medium-high | high |
| Academic papers (peer-reviewed) | 8 | high | high |
| Government/regulatory (FAA, NASA) | 5 | high | high |
| Expert opinion | 4 | medium-high | medium |
| Startup white papers | 2 | medium | low |
| Market projections | 2 | medium | low |

**Overall Evidence Quality**: high — exceptional depth across all three unknowns, with primary sources (FCC filings, IEEE TNS papers, NASA testing) dominating
**Diversity Score**: good — evidence from company data, academic research, government regulatory filings, independent analysts, and practitioner models

### Contradiction Log

| Topic | Position A | Position B | Resolution |
|-------|-----------|-----------|------------|
| GPU radiation survival | Google TPU survives 20× 5-year dose (no hard failure) | 5nm SEU cross-section 10× worse; ~640K bit-flips/day; destructive SEL demonstrated | PARTIALLY RESOLVED: Hardware survives (TID) but computational accuracy (SEU/SDC) is severely degraded. "Surviving" and "computing correctly" are different problems. |
| Starship cost trajectory | Citi projects $300/kg bear case; Falcon 9 achieved 20× cost reduction | SpaceX hit 5/25 flights in 2025; independent analysts say $1,000-2,500/kg; Shuttle missed costs by 300× | UNRESOLVED: Feasibility vs. timeline. Direction is clear, timing is not. |
| Market signal | $1.25T SpaceX-xAI merger; Google Suncatcher; multiple players investing | AWS CEO: "just not economical"; no published $/FLOP comparison; Google says mid-2030s | PARTIALLY RESOLVED: Market participants distinguish between "eventually viable" and "viable now." Even believers are investing for 5-10yr horizons. |
| Error correction overhead | ABFT achieves 4-8% overhead for DNN protection | Combined TMR + ABFT + checkpointing + scrubbing = 75-85% throughput loss | UNRESOLVED: Depends on which protection layers are required. Single-technique overhead is manageable; full-stack is devastating. Actual requirement unknown without orbital testing at scale. |

**Critical Contradictions**: 2 — The GPU radiation TID vs. SEU contradiction and the error-correction overhead range are both critical to the economic thesis. Neither can be fully resolved without actual orbital AI training data at scale.

### Unknown Resolution Status

| Unknown | Kill Condition | Status | Conviction Condition | Status |
|---------|---------------|--------|---------------------|--------|
| 1: $/FLOP crossover | >2× cost at optimistic inputs | Not testable without more data | Third-party parity analysis or pilot program | PARTIALLY MET (pilots exist, no parity analysis within 36mo) |
| 2: GPU radiation survival | Replacement within 12-18 months; or SEU rates unacceptable | PARTIALLY TRIGGERED (SEU path) | 5+ year COTS survival; or rad-hard at <3× premium; or ECC compensates | PARTIALLY MET (TID survival confirmed; SEU compensation unclear) |
| 3: Starship reuse/$/kg | No booster reuse by end-2027; or <10 flights/booster; or <50 flights/yr from Boca Chica | PARTIALLY TRIGGERED (FAA cap triggered; cadence trending toward trigger) | Booster reuse <72hr; 20+ flights in 2026; or <$10M per flight | NOT MET |

**Unresolved Unknowns**: Error-correction throughput penalty is the critical unresolved variable. Real-world range could be 8% (manageable) or 85% (thesis-killing). Only orbital testing at training scale will resolve this.
**Decision Criticality**: Yes — the throughput penalty determines whether the solar advantage translates to $/FLOP advantage or is consumed by error correction.

### Belief Update

**Prior Confidence**: 0.90 (from novelty scoring; high Toulmin qualifier)
**Posterior Confidence**: 0.35

**Confidence Change**: -0.55

**Key Drivers of Update**:

1. **Starship timeline is 5-8 years, not 3** (-0.25): The evidence is overwhelming that Starship will not achieve sub-$200/kg within 36 months. Only 5 flights in 2025. No ship reuse. V3 hasn't flown. Falcon 9 took 12 years. Every credible third party (Google, Deutsche Bank, independent analysts) says mid-2030s. The 36-month claim is pure Musk optimism.

2. **Radiation throughput penalty may destroy the economic case** (-0.20): The 10× SEU spike at 5nm, destructive latchup risk, and estimated 640K daily bit-flips create a severe computational reliability problem. If the full error-correction stack (TMR + ABFT + checkpointing) is required, the 4-7× throughput reduction means free solar power cannot compensate. Energy is only 15% of DC TCO; chips are 70%.

3. **Physics mechanism is real and smart money agrees** (+0.10): The solar advantage is confirmed physics. Google, SpaceX, Bezos, Schmidt, and multiple startups are all investing. This is not a crank idea — it's a timing question. The prior was too high (novelty-driven), but the direction is validated.

4. **No published all-in $/FLOP comparison exists** (-0.10): The thesis makes a specific economic claim, but no credible source has published a complete lifecycle $/FLOP model for orbital vs. terrestrial. The Starcloud model excludes 99%+ of common costs. McCalip shows a 2.1× gap. The economic case remains unproven.

5. **The "space vs. nothing" framing partially rescues the thesis** (-0.10 less than it would otherwise be): Even before cost parity, orbital compute may capture demand that terrestrial infrastructure physically cannot serve. This modifies the thesis from "cheapest" to "available when alternatives aren't."

**Confidence Calibration Notes**:
- The prior of 0.90 was inflated by novelty scoring — high novelty does not mean high probability
- The 36-month timeline is the specific thesis being evaluated; the broader thesis that space compute eventually becomes competitive retains much higher confidence (~0.70)
- The posterior of 0.35 reflects that the thesis AS STATED (cheapest within 36 months) is unlikely to be true, despite the directional mechanism being sound
- Two critical contradictions remain unresolved (radiation throughput, error correction range) that could move confidence in either direction by ~±0.15

### Gate Assessment

**Thesis Status**: MODIFY

**Rationale**:

The core insight is valid but the framing is wrong. The evidence conclusively shows that:

1. The physics mechanism works (5-8× solar advantage = real)
2. Smart money is investing (Google, SpaceX, Bezos, Schmidt)
3. Terrestrial power is genuinely constrained (5-7yr grid delays)
4. Commercial chips can physically survive LEO (Google TPU data)

But the thesis AS STATED — "cheapest within 36 months" — fails on multiple fronts:

1. Starship won't reach $200/kg within 36 months (every credible source says 5-8+ years)
2. Radiation throughput penalties may consume the solar advantage
3. No credible economic analysis shows parity within 36 months

The thesis should be modified to either:
- **Extended timeline**: "Space-based AI compute will reach cost parity by ~2032-2035, creating a multi-trillion dollar market" (confidence: ~0.55)
- **Capacity thesis**: "Space-based AI compute will serve as incremental capacity that terrestrial infrastructure cannot provide, even before reaching cost parity" (confidence: ~0.60)
- **SpaceX-specific thesis**: "The SpaceX-xAI vertical integration creates a uniquely positioned entity that will capture the orbital compute market as it emerges over the next decade" (confidence: ~0.55)

**Gate Criteria Check**:
- [ ] Posterior confidence ≥ 0.65? **NO** — 0.35 (thesis as stated)
- [ ] No unresolved decision-critical unknowns? **NO** — error correction throughput is unresolved
- [ ] No kill conditions triggered? **NO** — Unknown 3 partially triggered; Unknown 2 partially triggered
- [ ] Evidence supports core mechanism? **YES** — physics works, but timeline and throughput are problems

---

### Modification Notes

**Original Thesis**:
Space-based AI compute will achieve lower cost-per-FLOP than terrestrial alternatives within 36 months, driven by 10x solar economics and uncapped power scalability.

**Suggested Revision**:
Space-based AI compute is an emerging reality backed by real physics, real capital, and real hardware — but cost parity is 5-8 years away, not 3. The investable thesis is not "cheapest in 36 months" but rather: (a) the orbital compute market will grow to $39B+ by 2035, and (b) SpaceX's vertical integration (via xAI merger) creates a monopoly position in the enabling infrastructure.

**What Changed**:
- Timeline extended from 36 months to 5-8 years based on Starship development reality and Google/analyst consensus
- Economic case complicated by radiation throughput penalty (~15-25% effective throughput under full error-correction stack)
- Thesis reframed from "cheapest" to "emerging market with structural winner (SpaceX)"

**Next Steps**:
1. Decide whether to pursue the modified thesis or kill the original
2. If modifying: update stage-2-thesis.md with revised framing, re-evaluate failure modes
3. The existing evidence base is sufficient — no additional research needed
4. Key monitoring signal: Starship V3 first flight and ship recovery attempts (expected 2026)
