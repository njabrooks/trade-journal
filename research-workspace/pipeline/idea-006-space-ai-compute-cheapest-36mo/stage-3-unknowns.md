---
stage: 3
title: "Unknown Mapping"
source_thesis: "Space-based AI compute will achieve lower cost-per-FLOP than terrestrial alternatives within 36 months, driven by 10x solar economics and uncapped power scalability."
created_at: "2026-02-10T00:00:00Z"
---

# Decision-Critical Unknowns: Space-Based AI Compute Economics

## All Unknowns (Ranked by Decision Impact)

1. **All-in $/FLOP crossover economics: does space actually beat terrestrial when you include launch, hardware replacement, cooling, and data backhaul?** - HIGH impact
2. **GPU/accelerator survival duration in LEO radiation environment** - HIGH impact
3. **Starship reuse cadence and achieved $/kg to LEO** - HIGH impact
4. **Data backhaul bandwidth achievable with optical inter-satellite and space-to-ground links** - MEDIUM impact
5. **Terrestrial power cost trajectory (SMRs, behind-the-meter solar, grid acceleration)** - MEDIUM impact
6. **Thermal management feasibility for kW-class chips in vacuum** - MEDIUM impact
7. **Regulatory/orbital slot constraints on large-scale LEO compute constellations** - LOW impact
8. **Investability: available public/private market expressions of the thesis** - LOW impact

---

## Top 3 Unknowns (Detailed Analysis)

### Unknown 1: All-In $/FLOP Crossover Economics

**Decision Impact**: HIGH — This is the thesis itself, reduced to a number. If the all-in cost per FLOP in orbit (launch + hardware + replacement cycles + solar panels + cooling + data backhaul + operations) does not cross below terrestrial all-in cost (power + land + grid + cooling + construction + batteries), the thesis is dead regardless of how impressive the solar physics are. Musk's claim focuses on the power cost advantage (10x) but ignores or hand-waves several cost categories that don't exist terrestrially.

**Resolution Type**: empirical

**Externally Resolvable**: partially — The terrestrial side is well-documented (data center capex/opex benchmarks from Uptime Institute, IEA, hyperscaler filings). The space side requires building a cost model from component estimates since no one has deployed this at scale. Key inputs (launch cost, solar panel $/W, satellite bus cost, accelerator cost) are individually estimable; the synthesis is the hard part.

**Kill Condition**:
A bottom-up cost model shows all-in space compute at >2x terrestrial cost-per-FLOP even under optimistic assumptions (Starship at $100/kg, 3-year GPU survival, $0.50/W space solar). If the economics don't work with generous inputs, they won't work in reality. Specifically: if the launch + hardware replacement cost alone (ignoring power savings) exceeds $0.03/kWh equivalent — the current terrestrial industrial power rate — the power advantage is consumed by delivery costs.

**Conviction Increase Condition**:
A credible third-party analysis (aerospace consultancy, hyperscaler internal study, or academic paper) shows space compute reaching cost parity under conservative assumptions. Alternatively, SpaceX or any hyperscaler announces a space compute pilot program with published economics. Any entity putting real capex behind this validates that their internal models show crossover.

**Recommended Sources**:
- **Starship payload economics**: SpaceX public statements, Payload Research Group, Ars Technica (Eric Berger's reporting)
- **Terrestrial data center cost benchmarks**: Uptime Institute annual reports, IEA Data Centres & Energy report, JLL/CBRE data center market reports
- **Space solar panel costs**: Spectrolab, SolAero Technologies product data; NASA SBIR grants for high-efficiency space solar
- **Satellite bus/platform costs**: SDA (Space Development Agency) Tranche procurement data (standardized LEO buses at known prices)
- **Academic/industry cost models**: Any published techno-economic analyses of orbital data centers (search IEEE, arXiv, IAC conference proceedings)

**Estimated Effort**: 6-8 hours (building the comparative cost model is the bulk of the work)

**Research Queries**:
1. What is the current and projected $/kg to LEO for Starship, and what flight cadence is required to achieve it?
2. What is the all-in cost per kWh for a terrestrial hyperscale data center (including grid interconnect, backup power, and cooling)?
3. What is the $/watt for space-grade solar panels, and what is their mass per watt (determines launch cost of power generation)?
4. Has any entity published a techno-economic model comparing orbital vs. terrestrial compute costs?
5. What is the cost per unit mass for a standardized LEO satellite bus (using SDA Tranche pricing as proxy)?

---

### Unknown 2: GPU/Accelerator Survival Duration in LEO Radiation

**Decision Impact**: HIGH — This is the most critical structural unknown. The entire economic model depends on how long GPUs last in orbit. A GPU that lasts 3-5 years (like terrestrial) is great — the power savings compound over its lifetime. A GPU that dies in 6-12 months from radiation damage turns the cost model upside down: you're paying launch costs to replace hardware faster than it generates value. Consumer/data center GPUs are NOT designed for space radiation. Radiation-hardened chips exist but cost 10-100x more and are generations behind in performance. This unknown could be a thesis killer.

**Resolution Type**: technological

**Externally Resolvable**: partially — Starlink satellite failure rates provide a proxy (same LEO environment, consumer-grade electronics). NASA and ESA publish LEO radiation environment data. Radiation testing of commercial electronics exists in academic literature. However, no one has put data center GPUs (H100/B200 class) in orbit, so we're extrapolating.

**Kill Condition**:
Evidence that commercial electronics in LEO experience failure rates requiring replacement within 12-18 months. Specifically: if Starlink satellite mean lifetime is under 3 years due to radiation-induced electronics failure (not orbital decay), this suggests GPUs — which are far more sensitive to bit errors than communication equipment — would fail faster. Alternatively, if radiation testing data on modern 3-5nm chips shows single-event upset rates that are unacceptable for AI training (corrupting model weights during training runs).

**Conviction Increase Condition**:
Evidence that: (a) Starlink satellites achieve 5+ year lifetimes with consumer-grade electronics, demonstrating LEO radiation is manageable; (b) radiation-hardened AI accelerators are in development at reasonable cost premiums (<3x); or (c) error-correction/redundancy techniques (like triple modular redundancy or checkpoint-restart for training) can compensate for elevated bit-flip rates without destroying throughput economics.

**Recommended Sources**:
- **Starlink failure data**: Jonathan McDowell's satellite tracking database; FCC filings on Starlink deorbit rates; SpaceX FCC filings on constellation reliability
- **LEO radiation environment**: NASA AE9/AP9 radiation models; ESA SPENVIS tool documentation
- **Commercial electronics radiation testing**: IEEE Transactions on Nuclear Science (NSREC conference papers); papers on single-event effects in advanced CMOS nodes
- **Radiation-hardened compute**: Microchip (formerly Microsemi) space-grade processors; any announcements from NVIDIA/AMD on rad-hard accelerators; DARPA programs on radiation-tolerant computing

**Estimated Effort**: 4-5 hours

**Research Queries**:
1. What is the observed mean lifetime and primary failure mode of Starlink satellites in LEO?
2. What are the single-event upset (SEU) rates for 5nm and 3nm CMOS in the LEO radiation environment?
3. Are any companies developing radiation-hardened or radiation-tolerant AI accelerators, and at what cost/performance premium?
4. What error-correction overhead would be required to run AI training on commercial GPUs in LEO without unacceptable model corruption?
5. What is the annual dose rate (TID) in LEO at Starlink altitudes (~550km), and what is the TID tolerance of modern data center GPUs?

---

### Unknown 3: Starship Reuse Cadence and Achieved $/kg

**Decision Impact**: HIGH — Starship is the single enabling technology. Without sub-$200/kg launch costs, the all-in economics cannot work even if every other variable is favorable. The thesis implicitly assumes Starship achieves airline-like operations (rapid turnaround, high reliability, minimal refurbishment). As of early 2026, Starship has completed suborbital tests and early orbital flights but has NOT demonstrated: (a) booster reuse, (b) ship reuse, (c) rapid turnaround. Each of these is a prerequisite for the cost structure the thesis requires. This unknown is highly resolvable — Starship development is public and well-tracked.

**Resolution Type**: empirical

**Externally Resolvable**: yes — Starship development is the most publicly tracked rocket program in history. Flight cadence, booster catch attempts, FAA licensing, and SpaceX's own statements provide real-time data. Industry analysts (Quilty Space, Payload Research) publish cost estimates.

**Kill Condition**:
By end of 2027 (18 months from now, halfway through the 36-month thesis window): Starship has not achieved booster reuse, OR achieved reuse cadence is under 10 flights per booster, OR FAA has imposed flight rate caps below 50/year from Boca Chica. Any of these would push the $/kg well above the threshold needed for space compute economics to work within the thesis timeframe.

**Conviction Increase Condition**:
By end of 2026: Starship demonstrates booster reuse with <72 hour turnaround, and SpaceX achieves 20+ orbital flights in a calendar year. This would put them on trajectory for the flight rates needed. Alternatively, SpaceX publishes or credibly leaks internal cost-per-flight targets below $10M (implying <$100/kg for 100+ ton payloads).

**Recommended Sources**:
- **SpaceX public updates**: SpaceX.com updates, Elon Musk social media posts, FCC/FAA filings
- **Independent tracking**: NSF (NASASpaceFlight.com) forums and articles; Everyday Astronaut; Scott Manley analyses
- **Industry analysis**: Quilty Space, Payload Research Group, BryceTech annual reports on launch market
- **FAA regulatory**: FAA AST launch license applications and environmental reviews for Boca Chica and KSC
- **Comparable data**: Falcon 9 booster reuse economics (15+ flights demonstrated) as lower bound for Starship potential

**Estimated Effort**: 2-3 hours (most data is readily accessible and well-aggregated by the space community)

**Research Queries**:
1. What is the current Starship flight cadence, and what milestones remain before full reusability (booster catch + ship recovery)?
2. What are credible independent estimates of Starship marginal launch cost at 10x, 50x, and 100x reuse?
3. What FAA constraints exist on Starship launch cadence from Boca Chica and Cape Canaveral?
4. How does Falcon 9 booster reuse economics (demonstrated ~20x reuse) inform Starship cost projections?
5. What is SpaceX's stated or estimated timeline for achieving 100+ Starship flights per year?

---

## Gate Assessment

**Decision**: advance

**Rationale**:

Three high-impact unknowns identified, all with clear kill conditions and at least partial external resolvability:

1. **All-in $/FLOP crossover** is the decisive unknown — it synthesizes everything else into a single yes/no answer. It's partially resolvable through building a bottom-up cost model from publicly available component costs. Kill condition is specific: if space compute can't beat $0.03/kWh equivalent even with optimistic inputs, thesis dies.

2. **GPU radiation survival** is the structural unknown most likely to kill the thesis outright. It's partially resolvable through Starlink failure data and radiation testing literature. Kill condition is specific: if commercial electronics in LEO fail within 12-18 months, the replacement cost destroys the economics.

3. **Starship reuse economics** is the most resolvable of the three — it's the most publicly tracked rocket program ever. Kill condition has a specific timeline: no booster reuse by end of 2027 means the 36-month thesis window is blown.

The research payoff is asymmetric: ~13 hours of research could either kill a thesis that's already linked to 3 active positions in the portfolio (preventing conviction creep on a flawed thesis) or validate the most contrarian idea in the pipeline (novelty 0.90) with enough specificity to inform position sizing. Either outcome is valuable.

The thesis should NOT be killed at this gate despite having significant unknowns, because the unknowns are researchable and the kill conditions are clear. A thesis with unresearchable unknowns would be killed here; this one has a concrete path to resolution.

---

## Research Plan (if advancing)

**Priority Order**:
1. Unknown 3: Starship reuse cadence and $/kg — 2-3 hours (most resolvable, gate the other unknowns)
2. Unknown 2: GPU radiation survival in LEO — 4-5 hours (structural thesis killer, research before building cost model)
3. Unknown 1: All-in $/FLOP crossover economics — 6-8 hours (synthesis of all inputs into the decisive model)

**Total Estimated Effort**: 12-16 hours

**Recommended Approach**:
Start with Unknown 3 (Starship) because it's the most resolvable and gates everything else — if Starship can't deliver sub-$200/kg, stop research immediately. Then tackle Unknown 2 (radiation) because it's the structural killer — if GPUs can't survive LEO, the power advantage is irrelevant. Only then build the full cost model (Unknown 1), which synthesizes Starship costs, GPU replacement cycles, solar panel economics, and terrestrial benchmarks into the decisive $/FLOP comparison.

The research should be structured as a **sequential kill chain**: each unknown is investigated with the goal of killing the thesis early. If it survives all three, conviction is earned.
