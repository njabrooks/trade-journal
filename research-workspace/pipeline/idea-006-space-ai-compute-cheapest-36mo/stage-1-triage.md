---
stage: 1
title: "Signal Triage"
source_audit: "db:research_insights/6f3821c5-7cc2-4ce1-9323-f83d82a21cc1"
source_claim_id: "claim-1"
source_db_claim_id: "86873f19-b03f-4bdb-a4ec-0456c8a967f9"
created_at: "2026-02-10T00:00:00Z"
---

# Stage 1: Signal Triage

## Selected Claim

### Claim 1: Space-Based AI Compute Will Be Cheapest Within 36 Months

**Level**: main
**Type**: macro_thesis_candidate
**Category**: macro
**Tickers**: SPACEX
**Time Horizon**: medium_term
**Qualifier**: high
**Novelty Score**: 0.90
**Consensus View**: Market assumes data centers will remain terrestrial, with focus on power grid constraints and land-based solutions. Space-based compute is considered futuristic/uneconomic.

**Claim**:
Within 36 months (likely 30), space will be the most economically compelling location for AI compute. Solar in space produces 5x more power than ground (no night, weather, atmosphere), eliminates need for batteries, and is the only way to scale beyond terrestrial power constraints.

**Evidence**:
- "My prediction is that it will be by far the cheapest place to put AI. It will be space in 36 months or less. Maybe 30 months."
- "Any given solar panel can do about five times more power in space than on the ground"
- "You also avoid the cost of having batteries to carry you through the night"
- "In fact, it's not five times cheaper, it's 10 times cheaper because you don't need any batteries"
- "The only place you can really scale is space"

**Reasoning**:
Space eliminates the day-night cycle, seasonality, clouds, and atmospheric losses (~30%). Combined with no battery requirement, effective power generation is 10x cheaper. Terrestrial power is constrained by permits, grid interconnect (12-month studies), and physical geography.

**Backing**:
"Electrical output outside of China, everywhere outside of China, it's more or less flat... China has a rapid increase in electrical output. But if you're putting data centers anywhere except China, where are you going to get your electricity?"

**Rebuttal**:
- GPU servicing in space is difficult or impossible
- Latency for training workloads may be problematic
- Launch costs and satellite manufacturing at scale unproven
- "It's harder to service them or you can't service them"

**Supporting Evidence Claims**: claim-8 (Solar 5-10x More Effective In Space), claim-9 (Starship Enables Million Tons To Orbit Annually)
**Rebutting Evidence Claims**: None

---

## Supporting Evidence Detail

### Claim 8: Solar 5-10x More Effective In Space

**Qualifier**: high

Solar panels in space produce approximately 5x more power than equivalent panels on Earth due to elimination of day-night cycle, weather, seasons, and atmospheric losses. Combined with no battery requirement, effective economics are 10x better.

- "You're also going to get about five times the effectiveness of solar panels in space versus the ground, and you don't need batteries"
- "The atmosphere alone results in about a 30% loss of energy"
- Solar panels for space are cheaper to manufacture (no heavy glass framing needed for weather resistance)

### Claim 9: Starship Enables Million Tons To Orbit Annually

**Qualifier**: medium

Starship's full reusability and rapid turnaround enables payload capacity of approximately one million tons to orbit per year, with potential to scale to a terawatt annually before fuel supply challenges.

- "I think you can get to around a terawatt a year of AI in space before you start having fuel supply challenges for the rocket"
- "You could probably do it with as few as 20 or 30 [Starships]"
- "SpaceX is gearing up to do 10,000 launches a year, and maybe even 20 or 30,000 launches a year"

---

## Existing DB Linkages

This claim (`86873f19-b03f-4bdb-a4ec-0456c8a967f9`) is already linked in Trade Journal:

| Thesis | Type | Mapping |
|--------|------|---------|
| Bullish Space Exploration | macro | supports |
| Bullish TSLA Long Term | asset | supports |
| Bullish SPACEX Medium Term | asset | supports |

---

## Gate Assessment

**Decision**: advance
**Rationale**: Claim selected for pipeline advancement. Novelty score 0.90 — strongly contrarian vs. market consensus that terrestrial data centers remain dominant. Qualifier is high with strong Toulmin structure (5 evidence points, 4 rebuttals, 2 supporting evidence claims). Mechanism is plausible — the physics argument (5x solar efficiency in space, no batteries) is sound. Key uncertainties are execution-dependent (Starship reuse cadence, satellite manufacturing scale, GPU reliability in space). Already linked to 3 active theses, indicating conviction. Worth formalizing into a standalone macro thesis for deeper investigation.

---

## Next Step

Run `/formalize-thesis pipeline/idea-006-space-ai-compute-cheapest-36mo` to proceed to Stage 2: Theme Formalisation.
