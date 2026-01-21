# Falsification analysis: Advanced packaging thesis faces one major challenge

**Bottom line:** The investment thesis that advanced packaging will capture disproportionate semiconductor value through 2028 survives most kill conditions but faces **one significant falsification**: foundries continue allocating 70-80% of record CapEx to leading-edge nodes, with only 10-20% going to advanced packaging. This capital allocation pattern directly contradicts the premise that value is shifting structurally toward packaging infrastructure.

The evidence on cost economics, however, largely **supports** the original thesis. TSMC has stopped claiming raw cost-per-transistor improvements and now reframes value as "cost-per-transistor-performance." Major AI chip designers are moving toward chiplets, not away from them. Intel 18A progress is real but yields remain below TSMC's.

---

## Kill condition 1: N2 pricing follows historical patterns

**Status: INCONCLUSIVE — evidence contradictory**

The N2 pricing question hinges entirely on which N3 baseline is used:

| Scenario | N3 Baseline | N2 Price | Multiple | Kill Condition Met? |
|----------|-------------|----------|----------|---------------------|
| Current N3P pricing | $25,000-$27,000 | $30,000 | **1.11-1.2x** | Yes |
| Earlier N3/N3E pricing | $18,000-$20,000 | $30,000 | **1.5-1.67x** | No |

TrendForce (September 2025, medium-high credibility) reported N2 wafers will cost "at least 50% more than 3nm wafers." However, TechNode citing Icsmart (October 2025, medium credibility) claimed TSMC finalized N2 pricing at $30,000, representing only 10-20% increase over current N3 average of $25,000-$27,000.

**Critical finding:** TSMC has raised N3 prices significantly, compressing the apparent N2 premium. This is accounting arbitrage rather than genuine cost stability.

**Samsung competitive pressure:** Samsung has cut 2nm pricing to $20,000—33% below TSMC's $30,000—creating downward competitive pressure. This could support continued node economics viability if Samsung achieves acceptable yields.

**Credibility assessment:** TrendForce and industry analysts (medium-high credibility) suggest 50%+ premiums; consumer tech press reports lower premiums. No official TSMC investor filing states N2/N3 pricing ratio explicitly.

---

## Kill condition 2: Major AI chip designers choose monolithic over chiplets

**Status: NOT TRIGGERED — chiplet adoption accelerating**

A systematic review of major AI accelerator architectures reveals the chiplet thesis remains intact:

| Company | Product | Node | Architecture | Disconfirms Thesis? |
|---------|---------|------|--------------|---------------------|
| NVIDIA | Rubin R100 GPU | N3P | **Chiplet** (2 compute dies + 2 I/O) | No |
| AMD | Instinct MI455X | N2 | **Chiplet** (2 GCDs + 2 MCDs) | No |
| AMD | EPYC Venice | N2 | **Chiplet** (8 CCDs + 2 IODs) | No |
| Google | TPU v7 Ironwood | N3 | **Chiplet** (dual-chiplet) | No |
| Apple | M5 Pro/Max/Ultra | N3 | **Moving to chiplet** | No |
| Apple | A20 | N2 | **WMCM multi-chip** | No |
| Microsoft | Maia 100 | N5 | Monolithic | Partial |
| NVIDIA | Vera CPU | ~N3 | Monolithic | Partial |

**Two monolithic exceptions found:**
1. **Microsoft Maia 100**: 105 billion transistors, monolithic 820mm² die—but uses older 5nm process, not N2, and focuses on inference workloads rather than frontier training
2. **NVIDIA Vera CPU**: Explicitly monolithic "to avoid chiplet boundaries" for latency benefits—but this is a CPU, not the flagship GPU; NVIDIA chose chiplets for Rubin where raw compute matters

**Key quote disconfirming monolithic dominance:** NVIDIA stated that for Vera CPU, "by avoiding chiplet boundaries, SCF delivers consistent latency and sustains over 90% of peak memory bandwidth under load." This reveals monolithic still has advantages for specific use cases—but NVIDIA explicitly chose chiplets for GPUs where those tradeoffs favor disaggregation.

**Apple directional evidence:** Apple is moving FROM monolithic TO multi-chip packaging. The M5 Pro/Max/Ultra will split CPU and GPU into separate silicon dies using 2.5D packaging. The A20 (first Apple 2nm chip) will use WMCM (Wafer-Level Multi-Chip Module) packaging, moving away from single-die InFo.

**Assessment:** No flagship AI training accelerator at N2 has chosen monolithic over chiplets. The two monolithic exceptions are on older nodes and serve specialized use cases.

---

## Kill condition 3: TSMC/Intel guide to continued cost-per-transistor improvement

**Status: NOT TRIGGERED — TSMC explicitly reframes away from cost-per-transistor**

**Direct quote from TSMC Q4 2025 earnings call (January 2026, high credibility):**
> "If you say that the cost per transistor is increased, I saw the cost per transistor, the performance compared, that called the **CP value [cost-per-transistor-performance]** is increased, is much better." — C.C. Wei, Chairman and CEO

This is an **explicit admission** that raw cost-per-transistor is no longer improving. TSMC has reframed the value proposition around cost-performance ratio rather than absolute transistor cost.

**Further confirmation from TSMC CFO Wendell Huang (Q4 2025):**
> "Today we face increasing manufacturing cost challenges due to the rising cost of leading nodes. For example, the cost of tools are becoming more expensive and process complexity is increasing. As a result, the **CapEx dollar required to build 1K wafers per month capacity of N2 is substantially higher** than 1K wafers per month capacity for N3. The CapEx per K cost for A14 will be even higher."

**Historical context:** Google's Milind Shah confirmed at a 2024 industry presentation that per-transistor cost stopped decreasing at 28nm and has increased since 2012.

**Assessment:** Neither TSMC nor Intel has guided to continued cost-per-transistor improvement. This kill condition is clearly not met—the evidence actually **supports** the original thesis.

---

## Kill condition 4: EUV high-NA demonstrates greater than 80% yield

**Status: PARTIALLY MET — test structures only, not full production**

**IMEC results (September 2025, SPIE conference, high credibility):**
- Achieved **100% electrical test yield** for 20nm pitch ruthenium metal lines with single-exposure High-NA EUV
- February 2025: Demonstrated **>90% electrical yield** for metallized structures at 20nm pitch

**Critical caveat:** These are yields for specific **test structures** (serpentine and fork-fork metal lines) in an R&D environment—not full chip production yields. The kill condition specifies ">80% yield within 18 months," which is met for test structures but production yields remain unproven.

**High-NA timeline reality:**
- Intel and TSMC's current nodes (18A, N2) **do not use High-NA**—they use conventional 0.33 NA EUV
- High-NA (0.55 NA) is targeted for next-generation nodes: Intel 14A, TSMC A16
- Full HVM with High-NA not expected until **2027-2028** per ASML CEO Christophe Fouquet

**Assessment:** The technology is demonstrating capability, but production-relevant yields remain 2-3 years away. This kill condition is not definitively triggered.

---

## Critical disconfirming evidence: CapEx allocation contradicts value shift thesis

**Status: STRONG FALSIFICATION SIGNAL**

This is the **strongest evidence against** the thesis. TSMC's CapEx allocation directly contradicts the claim that value is shifting toward packaging infrastructure:

| Category | 2025 Allocation | 2026 Allocation |
|----------|-----------------|-----------------|
| **Advanced Process Technologies** | 70% | 70-80% |
| Specialty Technologies | 10-20% | ~10% |
| **Advanced Packaging, Testing, Mask** | 10-20% | 10-20% |

**Scale:** TSMC's 2026 CapEx will reach **$52-56 billion**—a record high. Even at the upper bound of 20% allocation, packaging receives only $10-11 billion while leading-edge nodes receive $36-45 billion.

**Intel's position:** Intel CFO admitted packaging expectations for 2025 were "too optimistic" as TSMC CoWoS capacity expanded faster than anticipated. Intel's $18 billion CapEx prioritizes 18A process development.

**SEMI data (medium-high credibility):** Wafer fab equipment (WFE) spending reaches $110-117 billion in 2025. Leading-edge logic plus memory accounts for approximately 50% of total equipment investment. Back-end/packaging equipment is recovering but remains substantially smaller than WFE.

**Interpretation:** If foundries believed packaging would capture disproportionate value, rational capital allocation would shift toward packaging infrastructure. The 70-80% allocation to leading-edge nodes suggests foundries still expect nodes—not packaging—to drive value creation.

---

## Intel 18A progress: Node scaling shows resilience

**Status: MODERATE DISCONFIRMING EVIDENCE**

Intel 18A yields have improved dramatically:

| Date | Yield | Source |
|------|-------|--------|
| Late 2024 | ~5% | TrendForce |
| July 2025 | ~55% | KeyBanc analyst |
| Q3 2025 | **60%+** | KeyBanc analyst John Vinh |
| Nov 2025 | 7% monthly improvement rate | Intel VP at RBC Conference |

**KeyBanc analyst John Vinh (January 2026, medium-high credibility):**
> "18A yields improving to over 60% and good enough to ramp Panther Lake. While not best in class, as TSMC was at 70-80% when it launched 2nm...60%+ yield is significantly better than SF2 at Samsung Foundry, which we believe is less than 40%."

**Customer commitments:** Apple reportedly in discussions for 18A (low-end M-series) and 14A (A-series); Microsoft and Amazon committed for custom chips; U.S. DoD for secure enclave programs.

**Assessment:** Intel 18A is recovering after a troubled start. The yield trajectory is positive, suggesting node scaling—while challenged—is not dying. However, Intel remains behind TSMC (60% vs 70-80%), and these yields required extraordinary effort to achieve.

---

## Synthesis: Where the thesis is vulnerable

**Kill condition scorecard:**

| Kill Condition | Evidence | Status |
|----------------|----------|--------|
| N2 pricing <1.5x N3 | Contradictory data; depends on N3 baseline | **Inconclusive** |
| Monolithic N2 over chiplets | No flagship AI chip chose monolithic at N2 | **Not triggered** |
| Continued cost-per-transistor guidance | TSMC explicitly reframed to "CP value" | **Not triggered** |
| EUV high-NA >80% yield | 90-100% on test structures; production TBD | **Partially met** |
| Node CapEx prioritized over packaging | 70-80% to nodes vs 10-20% to packaging | **Triggered** |
| Intel 18A on track | 60%+ yields, HVM achieved, major customers | **Partially triggered** |

**Primary vulnerability:** The CapEx allocation data is the most serious falsification signal. Foundries are voting with their capital, and they're allocating 4-8x more to node development than packaging. This suggests industry insiders do not yet believe packaging will capture disproportionate value.

**Secondary vulnerability:** Intel 18A's improving trajectory and IMEC's High-NA results suggest node scaling retains more vitality than "death of Moore's Law" narratives imply. The 2028 horizon may be too near for a structural value shift.

**Where thesis remains strong:** TSMC's explicit admission that cost-per-transistor is rising (not declining) strongly supports the economic premise. The industry's universal move toward chiplets (including Apple's strategic pivot) validates the architectural premise. No evidence suggests monolithic designs are winning at N2.

---

## Conclusion: One kill condition triggered, thesis survives with caveats

The advanced packaging thesis survives rigorous falsification testing but with an important asterisk: **foundry capital allocation does not yet reflect the hypothesized value shift**. TSMC's 70-80% CapEx allocation to leading-edge nodes versus 10-20% to packaging is the single most damaging datapoint for the thesis.

However, this may be a lagging indicator. CapEx decisions made in 2024-2025 reflected 2022-2023 demand signals, before the full AI-driven packaging demand materialized. The thesis could still be correct about 2027-2028 value capture even if current CapEx doesn't reflect it.

**Evidence strength summary:**
- **Against thesis:** CapEx allocation (strong), Intel 18A progress (moderate), High-NA test yields (moderate)
- **For thesis:** Cost-per-transistor economics (strong), chiplet adoption trajectory (strong), TSMC's implicit cost admissions (strong)

**Risk-adjusted position:** Investors should monitor 2026-2027 CapEx guidance for signs of packaging allocation increases. A shift from 20% to 30%+ packaging allocation would validate the thesis; continued 70%+ node allocation would further falsify it.