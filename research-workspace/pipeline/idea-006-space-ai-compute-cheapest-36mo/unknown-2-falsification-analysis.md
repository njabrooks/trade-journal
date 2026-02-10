# Unknown 2 Falsification: GPU/Accelerator Survival Duration in LEO Radiation

**Research Date**: 2026-02-10
**Objective**: Find evidence that this thesis is WRONG

## Findings

### Finding 1: Starlink satellites achieve ~5.3-year median lifetime with zero confirmed radiation-caused failures
- **Source**: industry report / academic tracking
- **Source URL/Reference**: [Jonathan McDowell's Starlink Statistics (Harvard-Smithsonian)](https://planet4589.org/space/con/star/stats.html), [Starlink Lifetime Analysis](https://space.gekko.de/starlink-lifetime-upgrades/)
- **Credibility**: high — McDowell is the authoritative independent tracker of all orbital objects; Kaplan-Meier survival analysis is a standard statistical method
- **Content**: Of 4,714 Gen1 Starlink satellites launched, ~132 experienced genuine uncontrolled failure (~2.7% failure rate), while 1,016 were deliberately retired/disposed. Kaplan-Meier survival analysis yields a **median satellite lifetime of approximately 5.3 years**. SpaceX's design lifetime is 5 years, with planned refresh cycles. Critically, **no confirmed Starlink failure has been publicly attributed to radiation-induced electronics damage**. Dominant failure modes are propulsion system failures, atmospheric drag during geomagnetic storms, software bugs, and communications failures. SpaceX proactively deorbited ~100 V1 satellites in 2024 after finding an undisclosed "common issue," but this was characterized as proactive maintenance, not radiation failure.
- **Bearing on thesis**: This is **strong evidence AGAINST the kill condition**. The kill condition requires Starlink lifetime under 3 years due to radiation-induced electronics failure. Instead, Starlink achieves 5+ years with COTS electronics and no identified radiation-caused failures.

### Finding 2: SpaceX deploys COTS electronics with TMR and confirms adequate radiation margin at 550km
- **Source**: academic paper / company filing
- **Source URL/Reference**: [SpaceX TID Monitoring in IEEE Trans. Nuclear Science (2024)](https://ieeexplore.ieee.org/document/10354004/), [SpaceX COTS Architecture (arXiv)](https://arxiv.org/html/2503.03722)
- **Credibility**: high — the IEEE TNS paper is authored by SpaceX engineers and published in the premier radiation effects journal; the arXiv paper cites SpaceX directly
- **Content**: SpaceX uses **32,000 Linux-based COTS computers (Intel x86)** across the Starlink constellation with **Triple Modular Redundancy (TMR)** and **Byzantine Fault Tolerance algorithms** for radiation mitigation. SpaceX deployed >5,000 COTS CMOS image sensors with TID monitoring circuits across the constellation. The IEEE paper concludes the constellation of TID circuits provides **"high confidence in design margin against cumulative dose risk"** at 550km, 53° inclination. SpaceX successfully mapped the South Atlantic Anomaly using single-event effects in these sensors.
- **Bearing on thesis**: Evidence AGAINST the kill condition. SpaceX has empirically validated that COTS electronics survive in LEO at 550km with software-based mitigation. However, communication/routing processors face far less demanding computational requirements than AI training GPUs.

### Finding 3: 5nm FinFET SEU cross-section is 10× worse than 7nm — an unprecedented reversal
- **Source**: academic paper
- **Source URL/Reference**: [Pieper, Bhuva et al., IEEE TNS 2022 (Vanderbilt)](https://www.researchgate.net/publication/365952507_Single-Event_Upset_Cross-Section_Trends_for_D-FFs_at_the_5-nm_and_7-nm_Bulk_FinFET_Technology_Nodes), [Pieper et al., NSREC 2023 — High-Frequency SEU](https://www.researchgate.net/publication/376214288_Single-Event_Upset_Cross-Section_at_High_Frequencies_for_RHBD_Flip_Flop_Designs_at_the_5-nm_Bulk_FinFET_Node), [Pieper et al., IEEE TNS 2024 — 3nm Evaluation](https://www.researchgate.net/publication/386062661_Evaluation_of_Fin_Geometry_and_Threshold_Voltage_Variants_on_Single-Event_Effects_in_7nm_5nm_and_3nm_Bulk_FinFET_Technologies)
- **Credibility**: high — Vanderbilt University radiation effects group is the leading research team worldwide; all papers are peer-reviewed in IEEE Transactions on Nuclear Science, the field's top journal
- **Content**: The 5nm bulk FinFET node shows a **single-event upset cross-section an order of magnitude (10×) higher than the 7nm node** for radiation-hardened-by-design flip-flop cells. This reversal was not seen at any prior node transition and is caused by disproportionate changes in SET pulse-widths and sensitive areas. At GHz frequencies (relevant to GPU operation at ~2 GHz), SEU cross-sections are **significantly higher** than at low frequencies. Scaling from 5nm to 3nm further reduces the minimum LET for multi-cell upsets, and MCU cluster sizes increase. The NVIDIA H100 uses TSMC 4nm/5nm — exactly the node where this vulnerability spike occurs.
- **Bearing on thesis**: **Strong evidence FOR the kill condition** (alternative condition about SEU rates). The specific chips that would be used for space-based AI compute are at the worst possible technology node for radiation vulnerability. This 10× increase in SEU susceptibility was not anticipated from prior scaling trends.

### Finding 4: FinFET technology shows increased single-event latchup sensitivity — risk of permanent GPU destruction
- **Source**: academic paper
- **Source URL/Reference**: [Ball, Sheets et al., IEEE TNS 2021 (Vanderbilt)](https://ieeexplore.ieee.org/document/9324760/), [Cannon et al., Sandia National Labs NSREC 2023](https://www.osti.gov/servlets/purl/2430642)
- **Credibility**: high — Vanderbilt and Sandia National Laboratories are the premier radiation effects testing groups
- **Content**: The 3× shallower trench isolation in FinFET structures significantly increases parasitic latchup gain. In 7nm bulk FinFET, the **SEL holding voltage can be as low as 0.85V at elevated temperatures** — within 100mV of nominal supply voltage (0.75V), meaning latchup, once triggered, is very likely to be sustained and cause thermal runaway/permanent destruction. Sandia radiation testing of **NVIDIA Xavier NX (12nm) and AMD Ryzen V1605B (14nm) GPU SoCs showed both devices exhibited destructive effects during SEL testing** at LET of 40 MeV-cm²/mg. Traditional SEL protective measures (guard rings, epitaxial substrates) become increasingly difficult to implement in FinFET.
- **Bearing on thesis**: **Strong evidence FOR the kill condition**. Single-event latchup can permanently destroy GPUs — not just cause recoverable errors. Both NVIDIA and AMD GPU SoCs have demonstrated destructive SEL susceptibility under heavy-ion exposure representative of the space environment. This is a hardware-killing failure mode, not a software-recoverable one.

### Finding 5: NASA COTS GPU testing shows functional interrupts every ~43 days in LEO radiation
- **Source**: academic paper / government report
- **Source URL/Reference**: [Bruhn et al., CEAS Space Journal, Springer 2020](https://link.springer.com/article/10.1007/s12567-020-00321-9), [NASA NTRS GPU Testing](https://ntrs.nasa.gov/api/citations/20140004427/downloads/20140004427.pdf)
- **Credibility**: high — NASA testing with Co-60 and particle beam irradiation
- **Content**: Five COTS graphics cards tested at radiation levels comparable to LEO applications suffered **no permanent damage at 6 krad TID** but experienced **multiple functional interrupts requiring full system reboots**. The best performer (AMD HD6450) achieved only **43.1 days mean time to functional interrupt (MTTFI)**. Separately, NVIDIA Jetson Nano survived beyond 20 krad TID. NASA GSFC confirmed: **"No radiation hardened GPU devices currently exist; any near term GPU-based onboard processors must use commercially available devices."**
- **Bearing on thesis**: **Evidence FOR the kill condition**. A reboot every 43 days would repeatedly interrupt multi-week AI training runs. For a cluster of thousands of GPUs, the probability of at least one GPU requiring a reboot on any given day approaches certainty, creating near-continuous training disruptions. However, the chips tested (AMD HD6450-class) are much simpler than modern data center GPUs, making direct extrapolation uncertain.

### Finding 6: Google TPU radiation testing shows commercial AI chips can survive shielded LEO for 5 years
- **Source**: company filing / industry report
- **Source URL/Reference**: [Google Research — Project Suncatcher](https://research.google/blog/exploring-a-space-based-scalable-ai-infrastructure-system-design/), [36Kr Analysis](https://eu.36kr.com/en/p/3539454902906759)
- **Credibility**: high — Google's own proton beam testing at 67 MeV
- **Content**: Google tested its **Trillium v6e TPU** (5nm-class) in a 67 MeV proton beam simulating LEO conditions. **HBM (the most sensitive component) showed irregularities only after 2 krad — nearly 3× the expected shielded 5-year mission dose of 750 rad.** No hard failures occurred up to the 15 krad maximum tested dose. With 10mm aluminum shielding at 550km LEO, Google estimates only **~150 rad/year** accumulated dose. However, Google noted that radiation sensitivity "does not hold beyond the 5nm node" — newer, more powerful chips may be more vulnerable.
- **Bearing on thesis**: **Strong evidence AGAINST the kill condition** for TID survivability. This is the most significant counter-evidence: a commercial 5nm-class AI accelerator surviving 3× the expected 5-year dose without hard failure. However, this tests TID only — it does not fully address SEU/SDC rates during sustained compute operations or SEL risk from heavy ions.

### Finding 7: Estimated ~640,000 bit flips per day in H100-class memory in LEO; 20% are multi-bit upsets
- **Source**: academic paper / in-orbit measurement
- **Source URL/Reference**: [ScienceDirect — SEU Overview](https://www.sciencedirect.com/topics/earth-and-planetary-sciences/single-event-upset), [Alsat-1 In-Orbit SEU Data (ResearchGate)](https://www.researchgate.net/publication/224380922_Observations_of_single-event_upsets_and_multiple-bit_upsets_in_random_access_memories_on-board_the_Algerian_satellite), [ASU SEE Reference](http://holbert.faculty.asu.edu/eee560/see.html)
- **Credibility**: high — in-orbit measurement data from operational LEO satellite
- **Content**: In LEO, commercial electronics typically exhibit SEU rates of **10⁻³ to 10⁻⁷ errors per bit-day**. Alsat-1 microsatellite measured ~10⁻⁶ errors/bit-day, with 80% single-bit and **20% multi-bit upsets** (MBU). ~80% of SEUs occurred in the South Atlantic Anomaly. Extrapolating to an H100's 80GB HBM3 memory (640 billion bits) at 10⁻⁶ errors/bit-day yields **~640,000 bit flips per day** — of which ~128,000 would be multi-bit upsets that standard ECC cannot correct. Critically, **shielding cannot significantly diminish SEU rates** because the causative particles (high-energy protons, heavy ions) penetrate typical aluminum shielding.
- **Bearing on thesis**: **Strong evidence FOR the kill condition**. Even if ECC catches single-bit errors, the multi-bit upset rate alone would produce ~128,000 uncorrectable memory errors per day per GPU. However, these rates are from older SRAM technology; modern HBM with integrated ECC may have different characteristics. Google's TPU test showing no hard failures at 3× 5-year dose provides counterbalancing evidence, though SEU rates during active computation may differ from TID survivability.

### Finding 8: Silent data corruption already occurs weekly during Earth-based AI training at scale
- **Source**: industry report / company filing
- **Source URL/Reference**: [Glenn Klockwood — SDC Analysis](https://www.glennklockwood.com/garden/silent-data-corruption), [Meta Engineering — SDC (2021)](https://engineering.fb.com/2021/02/23/data-infrastructure/silent-data-corruption/), [Adept AI — The Errant Hardware](https://www.adept.ai/blog/sherlock-sdc), [OCP — SDC in AI Whitepaper](https://www.opencompute.org/documents/sdc-in-ai-ocp-whitepaper-final-pdf)
- **Credibility**: high — first-hand engineering reports from Meta, Google, Adept AI, and NVIDIA
- **Content**: Meta reported **6 silent data corruption events during Llama 3 pre-training** on 16,384 H100 GPUs over 54 days. Google estimated SDC events during Gemini training occurred **"every week or two."** Adept AI discovered SDC where "the loss value was just slightly different from all previous runs" — completely invisible to ECC counters. NVIDIA's OCP whitepaper acknowledges that AI training's self-resilience to SDC "holds true in a fairly small subset of the possible SDC manifestations" and that persistent SDC from a corrupting device will continuously inject errors. The Llama 3 run experienced **466 total job interruptions, 419 unexpected, with 78% caused by hardware failures**.
- **Bearing on thesis**: **Strong evidence FOR the kill condition**. If SDC already occurs weekly in radiation-shielded, ECC-protected, temperature-controlled terrestrial data centers, the dramatically higher radiation environment of LEO would amplify SDC rates by orders of magnitude. ECC cannot protect computation in tensor cores — only stored data.

### Finding 9: Combined error-correction overhead reduces effective throughput to ~15-25% of nominal
- **Source**: academic paper / industry report
- **Source URL/Reference**: [ESA TMR Technical Document](http://microelectronics.esa.int/techno/fpga_003_01-0-2.pdf), [ACM — Maintaining Sanity (DAC)](https://dl.acm.org/doi/10.1145/3649329.3657355), [ACM — ATTNChecker (PPoPP)](https://dl.acm.org/doi/10.1145/3710848.3710870), [Dwarkesh Patel — Notes on Space GPUs](https://www.dwarkesh.com/p/notes-on-space-gpus)
- **Credibility**: high — ESA technical reference, peer-reviewed ACM conference papers, well-sourced technical analysis
- **Content**: TMR imposes a **minimum 3× hardware overhead** (ESA documents show 3.9-11× for comprehensive protection). ABFT for comprehensive DNN protection costs **7-72% runtime** depending on coverage. Checkpoint-restart in LEO's high-error environment would consume an estimated **10-30%** of training time (vs. ~5-7% on Earth). Memory scrubbing competes for bandwidth. Multiplicatively combining these layers yields **~15-25% of nominal throughput**. Critically, energy is only **~15% of data center TCO** (Dwarkesh Patel analysis) — the chips are ~70%. Free solar power cannot offset a 4-7× throughput reduction.
- **Bearing on thesis**: **Strong evidence FOR the kill condition**. Even if GPUs physically survive, the error-correction overhead destroys the economic case. A 10× solar advantage on the 15% of costs attributable to power cannot overcome a 4-7× reduction in effective compute throughput across the 70% of costs attributable to hardware.

### Finding 10: No radiation-hardened GPU exists; rad-hard processors are 5-10 generations behind
- **Source**: industry report / expert opinion
- **Source URL/Reference**: [SpaceNews — Radiation Shield Tech (2025)](https://spacenews.com/startups-radiation-shield-tech-could-bring-high-performance-ai-chips-to-space/), [NASA Spinoff — Cutting-Edge Computing in Space](https://spinoff.nasa.gov/Cutting-Edge_Computing_Goes_Spaceborne), [NASA GSFC — No Rad-Hard GPU](https://ntrs.nasa.gov/citations/20180006906), [BAE RAD750 (Wikipedia)](https://en.wikipedia.org/wiki/RAD750)
- **Credibility**: high — SpaceNews industry reporting, NASA official sources, established defense contractor specifications
- **Content**: SpaceNews (Sep 2025): **"Radiation-hardened chips are often five to 10 generations behind the latest commercial designs."** NASA Ames Director Rupak Biswas confirmed that radiation hardening traditionally **"takes 10 years and millions of dollars."** The BAE RAD750 — the industry standard rad-hard processor used on JWST and Mars rovers — runs at **110-200 MHz, costs ~$200,000 per board**, and delivers 266 MIPS vs. the H100's ~4 petaflops. The smallest "true" rad-hard process node is approximately **150nm**, representing a 30-50× feature size gap vs. commercial 3-5nm. NASA GSFC stated: **"No radiation hardened GPU devices currently exist."** Meanwhile, companies like Magics Technologies and Frontgrade Gaisler are developing rad-tolerant AI-oriented chips, but none approach data-center-class performance.
- **Bearing on thesis**: **Evidence FOR the kill condition**. There is no path to radiation-hardened AI compute at competitive performance levels. The cost premium for existing rad-hard chips (~4,000× for equivalent compute) and the multi-generational performance gap make rad-hard AI accelerators effectively impossible within the thesis's 36-month timeframe.

## Kill Condition Assessment

**Kill condition from thesis**:
> Evidence that commercial electronics in LEO experience failure rates requiring replacement within 12-18 months. Specifically: if Starlink satellite mean lifetime is under 3 years due to radiation-induced electronics failure (not orbital decay), this suggests GPUs — which are far more sensitive to bit errors than communication equipment — would fail faster. Alternatively, if radiation testing data on modern 3-5nm chips shows single-event upset rates that are unacceptable for AI training (corrupting model weights during training runs).

**Evidence FOR kill condition being triggered**:
- The 5nm FinFET node shows a **10× increase in SEU cross-section** vs. 7nm — an unprecedented reversal that directly affects H100/A100-class chips (Finding 3)
- Both NVIDIA and AMD GPU SoCs demonstrated **destructive single-event latchup** under heavy-ion testing at LET 40 MeV-cm²/mg, which can permanently kill hardware (Finding 4)
- Extrapolated SEU rates suggest **~640,000 bit flips per day** in H100-class HBM memory in LEO, with ~128,000 multi-bit upsets that ECC cannot correct (Finding 7)
- Silent data corruption already occurs **weekly in terrestrial data centers** with full shielding; LEO rates would be orders of magnitude higher (Finding 8)
- COTS GPU testing shows **mean time to functional interrupt of ~43 days** in LEO-equivalent radiation (Finding 5)
- Combined error-correction overhead reduces effective throughput to **15-25% of nominal**, destroying the economic case even if hardware survives (Finding 9)
- **No radiation-hardened GPU exists**, and rad-hard processors are 5-10 generations behind, making the 36-month timeline impossible for a rad-hard AI solution (Finding 10)
- High-frequency operation (GPU clock speeds ~2 GHz) **significantly worsens** SEU cross-sections beyond low-frequency test results (Finding 3)
- **Shielding is ineffective** against the high-energy protons and heavy ions that cause SEUs — you cannot shield your way out of this problem (Finding 7)

**Evidence AGAINST kill condition being triggered**:
- Starlink achieves **~5.3-year median lifetime** with COTS electronics and **zero confirmed radiation-caused failures** (Finding 1)
- SpaceX TID monitoring confirms **"high confidence in design margin"** at 550km LEO (Finding 2)
- Google's Trillium TPU survived **3× the expected 5-year shielded dose (2 krad vs. 750 rad)** without hard failure at up to 15 krad tested (Finding 6)
- **Starcloud-1 successfully operated an NVIDIA H100 in orbit** (launched Nov 2025), training NanoGPT and running Gemma LLM inference — a genuine proof of concept
- TID at 550km with 10mm aluminum shielding is only **~150 rad/year** — very low and well within commercial chip tolerance (Finding 6)
- Modern COTS CMOS technologies with thinner gate oxides show **improved TID tolerance** (500 krad at 20nm vs. 10 krad at 40nm)
- ABFT techniques for DNN workloads can achieve fault tolerance with as little as **4-8% runtime overhead** (ATTNChecker, FT-CNN)
- Neural networks exhibit some **intrinsic fault tolerance**: 100 random bit flips did not significantly degrade ImageNet accuracy in testing
- NASA's NESC endorses COTS electronics for LEO missions, noting high-volume commercial parts can match or exceed MIL-SPEC reliability

**Assessment**: **PARTIALLY TRIGGERED**
**Confidence in assessment**: **medium-high** — The first literal condition (Starlink under 3 years from radiation) is clearly NOT met. However, the alternative condition (SEU rates unacceptable for AI training) has substantial supporting evidence that crosses the threshold of concern. The 10× SEU spike at 5nm, the destructive SEL risk, and the ~640K daily bit flips paint a concerning picture for sustained AI training. Crucially, the distinction between "electronics surviving for communication tasks" (Starlink) and "electronics performing error-free AI training" is enormous — communication equipment can tolerate occasional bit flips with packet retransmission, while AI training requires computational correctness across billions of operations per second. The Google TPU test result is the strongest counter-evidence, but it tested TID survivability, not computational accuracy under sustained SEU bombardment during training.

## Caveats and Limitations
- **No H100/A100 radiation test data exists publicly.** All GPU radiation testing has been performed on much simpler embedded SoCs (Jetson family, consumer GPUs). Extrapolation to 80-billion-transistor data center chips with 80GB HBM3 is highly uncertain and could go either direction.
- **The 640,000 bit-flips/day estimate is an extrapolation** from older SRAM technology on a different satellite. Modern HBM3 with integrated ECC may show substantially different characteristics. Google's TPU test provides counterbalancing but incompletely overlapping evidence.
- **Starcloud-1's H100 operates at 325km altitude** (lower radiation than 550km) with an **11-month mission life** — too short and too sheltered to validate long-term GPU survival for a commercial orbital data center.
- **The "kill condition" may be too binary.** The reality appears to be a spectrum: GPUs will likely physically survive in LEO for 3-5 years, but at dramatically reduced effective throughput due to error correction overhead. The question is whether this overhead destroys economics, not whether hardware literally dies.
- **SpaceX's undisclosed "common issue"** that triggered proactive deorbit of ~100 V1 satellites remains unknown — it could theoretically be radiation-related but there is no evidence for this.
- **Solar cycle effects matter significantly.** Current research data may not capture worst-case solar maximum conditions, which increase SEU rates by ~19% and can cause extreme solar particle events.
- **Google and SpaceX have massive engineering resources** that may find creative solutions not yet apparent — the space computing field is evolving rapidly, with multiple well-funded players.

## Summary

The falsification evidence reveals a nuanced but concerning picture for space-based AI compute. **The literal kill condition is not fully met**: Starlink satellites demonstrably achieve 5+ year lifetimes with commercial electronics, and Google's TPU radiation testing shows commercial AI chips can survive the total ionizing dose accumulated over a shielded 5-year LEO mission. Starcloud-1's successful H100 operation in orbit provides real proof of concept. These data points suggest that GPUs will not simply "die in 6-12 months" from radiation as the kill condition posits.

However, **the alternative kill condition — that SEU rates make AI training unacceptable — has strong and growing evidence.** The unprecedented 10× increase in SEU cross-section at the 5nm node (exactly where H100/A100 chips sit), the demonstrated destructive single-event latchup in both NVIDIA and AMD GPU SoCs, and the extrapolated hundreds of thousands of daily bit flips in H100-class memory collectively paint a picture of severe computational reliability challenges. The critical insight is that **surviving radiation and computing correctly through radiation are fundamentally different problems.** Starlink satellites tolerate bit flips through packet retransmission; AI training requires computational correctness across trillions of floating-point operations, where a single corrupted gradient can cascade through model weights. Silent data corruption already plagues terrestrial AI training at scale — Meta and Google report weekly SDC events — and LEO radiation would amplify this by orders of magnitude.

The economic analysis is perhaps the most damaging finding. Even under optimistic assumptions where GPUs physically survive, the combined overhead of error correction (TMR at 3×, ABFT at 7-72%, enhanced checkpointing, memory scrubbing) reduces effective throughput to roughly **15-25% of nominal performance**. Since energy accounts for only ~15% of data center total cost of ownership while chips account for ~70%, free solar power cannot compensate for a 4-7× throughput penalty. The thesis claims space-based AI will achieve lower cost-per-FLOP within 36 months; the evidence suggests that radiation-induced error correction overhead alone — setting aside launch costs, thermal management, maintenance impossibility, and hardware obsolescence — makes effective cost-per-useful-FLOP significantly worse in orbit than on the ground. The kill condition is partially triggered with medium-high confidence, primarily through the computational reliability pathway rather than the hardware survival pathway.

## References

1. [Jonathan McDowell — Starlink Statistics](https://planet4589.org/space/con/star/stats.html)
2. [Starlink Lifetime Kaplan-Meier Analysis](https://space.gekko.de/starlink-lifetime-upgrades/)
3. [SpaceX — Starlink Approach to Satellite Demisability](https://starlink.com/public-files/Starlink_Approach_to_Satellite_Demisability.pdf)
4. [SpaceX TID Monitoring — IEEE Trans. Nuclear Science (2024)](https://ieeexplore.ieee.org/document/10354004/)
5. [SpaceX COTS Linux Architecture — arXiv](https://arxiv.org/html/2503.03722)
6. [Pieper, Bhuva et al. — 5nm/7nm SEU Cross-Section Trends, IEEE TNS 2022](https://www.researchgate.net/publication/365952507_Single-Event_Upset_Cross-Section_Trends_for_D-FFs_at_the_5-nm_and_7-nm_Bulk_FinFET_Technology_Nodes)
7. [Pieper et al. — High-Frequency SEU at 5nm, NSREC 2023](https://www.researchgate.net/publication/376214288_Single-Event_Upset_Cross-Section_at_High_Frequencies_for_RHBD_Flip_Flop_Designs_at_the_5-nm_Bulk_FinFET_Node)
8. [Pieper et al. — 7nm/5nm/3nm FinFET SEE Evaluation, IEEE TNS 2024](https://www.researchgate.net/publication/386062661_Evaluation_of_Fin_Geometry_and_Threshold_Voltage_Variants_on_Single-Event_Effects_in_7nm_5nm_and_3nm_Bulk_FinFET_Technologies)
9. [Ball, Sheets et al. — FinFET SEL Sensitivity, IEEE TNS 2021](https://ieeexplore.ieee.org/document/9324760/)
10. [Cannon et al. — GPU SoC SEE Testing, Sandia National Labs NSREC 2023](https://www.osti.gov/servlets/purl/2430642)
11. [Bruhn et al. — COTS GPU Radiation Testing, CEAS Space Journal (Springer 2020)](https://link.springer.com/article/10.1007/s12567-020-00321-9)
12. [NASA — COTS GPU Radiation Testing Report](https://ntrs.nasa.gov/api/citations/20140004427/downloads/20140004427.pdf)
13. [Google Research — Project Suncatcher Space AI Infrastructure](https://research.google/blog/exploring-a-space-based-scalable-ai-infrastructure-system-design/)
14. [Alsat-1 In-Orbit SEU Measurements](https://www.researchgate.net/publication/224380922_Observations_of_single-event_upsets_and_multiple-bit_upsets_in_random_access_memories_on-board_the_Algerian_satellite)
15. [Glenn Klockwood — Silent Data Corruption in AI](https://www.glennklockwood.com/garden/silent-data-corruption)
16. [Meta Engineering — Silent Data Corruption (2021)](https://engineering.fb.com/2021/02/23/data-infrastructure/silent-data-corruption/)
17. [Adept AI — The Adventure of the Errant Hardware](https://www.adept.ai/blog/sherlock-sdc)
18. [OCP/NVIDIA — SDC in AI Whitepaper](https://www.opencompute.org/documents/sdc-in-ai-ocp-whitepaper-final-pdf)
19. [ESA — TMR FPGA Technical Document](http://microelectronics.esa.int/techno/fpga_003_01-0-2.pdf)
20. [ACM DAC — Maintaining Sanity: Comprehensive Fault Tolerance for DNNs](https://dl.acm.org/doi/10.1145/3649329.3657355)
21. [ACM PPoPP — ATTNChecker: ABFT for LLM Attention](https://dl.acm.org/doi/10.1145/3710848.3710870)
22. [Dwarkesh Patel — Notes on Space GPUs](https://www.dwarkesh.com/p/notes-on-space-gpus)
23. [SpaceNews — Radiation Shield Tech for AI Chips (Sep 2025)](https://spacenews.com/startups-radiation-shield-tech-could-bring-high-performance-ai-chips-to-space/)
24. [NASA Spinoff — Cutting-Edge Computing Goes Spaceborne](https://spinoff.nasa.gov/Cutting-Edge_Computing_Goes_Spaceborne)
25. [NASA GSFC — No Rad-Hard GPU Exists](https://ntrs.nasa.gov/citations/20180006906)
26. [CNBC — Starcloud Trains First AI Model in Space (Dec 2025)](https://www.cnbc.com/2025/12/10/nvidia-backed-starcloud-trains-first-ai-model-in-space-orbital-data-centers.html)
27. [Andrew McCalip — Space Datacenter Cost Model](https://andrewmccalip.com/space-datacenters)
28. [CERN RADNEXT — From MOSFETs to FinFETs](https://radnext.web.cern.ch/blog/from-mosfets-to-finfets/)
29. [NUS — Radiation Analysis Framework for LEO Small Satellites](https://www.researchgate.net/publication/322649302_Radiation_analysis_and_mitigation_framework_for_LEO_small_satellites)
30. [ICCV 2019 — Bit-Flip Attack on Neural Networks](https://openaccess.thecvf.com/content_ICCV_2019/papers/Rakin_Bit-Flip_Attack_Crushing_Neural_Network_With_Progressive_Bit_Search_ICCV_2019_paper.pdf)
31. [EMNLP 2025 — Bit-Flip Error Resilience in LLMs](https://aclanthology.org/2025.emnlp-main.528.pdf)
32. [OneWeb Satellite Failure Data](https://orbitaltoday.com/2023/08/29/%D0%BEneweb-satellite-internet-review-pros-cons-availability/)
33. [Girgis et al. — SAA SEU Rate Increase During Storms, Space Weather 2023](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2023SW003664)
34. [Slater et al. — Jetson Nano TID Testing, IEEE NSREC 2020](https://ieeexplore.ieee.org/document/9286222/)