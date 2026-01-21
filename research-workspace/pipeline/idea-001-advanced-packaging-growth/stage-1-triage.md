---
stage: 1
title: "Signal Triage"
source_audit: "research-workspace/20260120-Advanced-Packaging-Catalyzing-Semiconductor-Renaissance-AI-HPC-audit.md"
source_claim_id: "claim-1"
created_at: "2026-01-21T12:00:00Z"
---

# Stage 1: Signal Triage

## Selected Claim

### Claim 1: Advanced Packaging is the New Growth Driver for Semiconductors as Moore's Law Slows

**Level**: main
**Type**: thesis_candidate
**Category**: macro
**Tickers**: ASML, TSM, INTC, AMKR, BESI
**Time Horizon**: long_term
**Qualifier**: high
**Novelty Score**: 0.75 (estimated)
**Consensus View**: Market still largely focused on node shrinks (N3, N2, 18A) as primary driver of semiconductor value creation. Advanced packaging viewed as complementary/niche rather than structural shift.

**Claim**:
Advanced packaging (chiplets, 2.5D/3D stacking, CoWoS, Foveros) has become the "next low-hanging fruit" for computing gains as traditional node scaling decelerates. This structural shift is reshaping the semiconductor supply chain and creating multi-year investment opportunities in enabling infrastructure.

**Evidence**:
- "With Moore's Law slowing and AI/ML workloads demanding ever more bandwidth, industry attention is shifting to these packaging innovations as the 'next low-hanging fruit' for computing gains"
- Chiplet-based designs can overcome reticle size limits and boost yield while connecting components with dense in-package interconnects for immense bandwidth
- TSMC's CoWoS capacity has been stretched by AI demand, indicating supply-demand imbalance
- Amkor building $7B Arizona advanced packaging campus - first U.S.-based high-volume OSAT for 2.5D/3D
- ASML entering advanced packaging lithography with new XT:2600 scanner (Q3 2025)

**Reasoning**:
When traditional transistor scaling becomes prohibitively expensive and yields diminishing returns, the industry must find alternative paths to performance improvement. Advanced packaging enables heterogeneous integration - combining best-in-class dies from different process nodes into optimized systems. This shifts value creation from pure node advancement to system-level integration capabilities.

**Backing**:
Historical precedent: The semiconductor industry has repeatedly overcome perceived limits through architectural innovation (multi-core, GPU compute, specialized accelerators). Advanced packaging represents the next wave, allowing continued performance scaling through integration rather than shrinking. Industry CapEx patterns confirm this - all major foundries and OSATs investing heavily in advanced packaging capacity.

**Rebuttal**:
- Cost per advanced package significantly higher than traditional packaging - may limit adoption to premium segments
- Yield challenges in 2.5D/3D integration remain (defect propagation across dies)
- Some believe EUV advances and node scaling still have runway (TSMC N2, Intel 18A)
- Geopolitical tensions could fragment the packaging supply chain

**Supporting Evidence Claims**: claim-13, claim-14, claim-15, claim-16, claim-17

---

## Supporting Evidence (from audit)

### Claim 13: TSMC CoWoS Capacity Constrained by AI Demand
TSMC's CoWoS advanced packaging capacity has been stretched by AI demand, indicating supply-demand imbalance. Amkor positioned to "gain substantial business from firms needing alternative packaging of big chiplet modules." Industry reports of multi-quarter lead times for CoWoS slots.

### Claim 14: Chiplets Can Overcome Reticle Size Limits and Boost Yield
Chiplet-based designs (multiple smaller dies operating as one) and 3D integrations (stacking memory or logic dies) can overcome reticle size limits and boost yield while enabling "connecting components with dense in-package interconnects for immense bandwidth."

### Claim 15: Amkor Building $7B Arizona Campus for US-Based 2.5D/3D OSAT
Amkor broke ground on a $7B advanced packaging campus in Arizona - the first U.S.-based high-volume OSAT for 2.5D/3D packaging, with anchor investments from Apple and NVIDIA. 750k sq. ft. of cleanroom by 2028.

### Claim 16: Besi Hybrid Bonding Orders Expanding Rapidly
Besi's order book for hybrid bonding systems is expanding as the technology moves from R&D into production. Applied Materials took €225M stake in Besi to accelerate development.

### Claim 17: Ibiden Raised Earnings Forecasts Twice in 2025 on AI Substrate Demand
Ibiden raised its earnings forecasts twice in 2025 on "stronger-than-expected demand for IC substrates used in AI servers." Orders exceeding capacity, investing to expand output 2.5× by 2027.

---

## Gate Assessment

**Decision**: advance

**Rationale**:
- **Novelty**: Estimated at 0.75 - this thesis challenges the consensus focus on node scaling and identifies a structural shift in semiconductor value creation
- **Mechanism**: Clear and plausible - advanced packaging enables continued performance scaling when node shrinks become uneconomical
- **Evidence**: Well-supported by 5 evidence claims showing supply-demand imbalance, capacity investments, and industry CapEx patterns
- **Actionability**: High - thesis points to specific investment opportunities across the value chain (foundries, OSATs, equipment, materials)

The claim meets gate criteria for Stage 2 advancement: novelty is above 0.6 threshold and mechanism is plausible with supporting evidence.

---

## Next Step

Run `/formalize-thesis pipeline/idea-001-advanced-packaging-growth` to proceed to Stage 2: Theme Formalisation.
