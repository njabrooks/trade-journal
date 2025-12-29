# Terminology & Domain Language
## Mapping Existing Terms to PRD v1.1 Concepts

**Version:** 1.0  
**Status:** Authoritative Reference  
**Purpose:** Establish consistent terminology for all future development, documentation, and communication.

---

## Overview

This document maps existing codebase terminology to PRD v1.1 concepts, identifies where terms align or diverge, and provides guidance for consistent usage going forward.

**Key Principles:**
1. **Preserve working terminology** where it aligns with PRD concepts
2. **Evolve terminology** where existing terms don't capture PRD intent
3. **Document mappings** to avoid confusion during transition
4. **Clarify PRD terms** that are new or need definition
5. **PRD terminology is stable** - only changes via explicit PRD revision

---

## Decision Loop (Visual)

The system implements a closed-loop decision process:

```
Trigger
  ↓
Triage (evaluate urgency / severity)
  ↓
Decision (with rationale + confidence)
  ↓
Action / Inaction
  ↓
Outcome
  ↓
Journal
  ↓
Retrospective Learning
  ↺ feeds back into Theses / Views
```

**Key Points:**
- **Triggers** initiate the loop (time-based, event-based, rule-based)
- **Triage** evaluates and prioritizes (urgency, severity)
- **Decisions** are explicit with rationale and confidence
- **Actions** or **Inaction** are both valid outcomes
- **Outcomes** are tracked and evaluated
- **Journal** captures the complete loop
- **Retrospective Learning** closes the loop by informing belief evolution

This loop operates at all hierarchy levels (macro thesis → asset thesis → strategy → position).

---

## Core Hierarchy Terms

### Decision Hierarchy (PRD v1.1)

The system implements a four-level decision hierarchy. Terms below map to this structure.

#### 1. Macro Thesis / Macro Theses
**PRD Term:** ✅ **Macro Theses**  
**Existing Term:** ❌ None (new concept)  
**Database:** `macro_theses` (Phase 1)  
**Definition:** Secular, cyclical, or structural beliefs that are cross-asset and non-asset-specific. Periodically re-underwritten based on evidence.

**Usage:**
- Use "Macro Thesis" (singular) or "Macro Theses" (plural)
- Types: `secular`, `cyclical`, `structural`
- Examples: "Inflation will remain structurally elevated", "Demographic shifts favor emerging markets"

**Related Terms:**
- **Thesis** (generic): Can refer to macro thesis, asset thesis, or strategy thesis. Be specific when context matters.
- **Belief**: Synonym for thesis at macro/asset level. "Belief" is more general; "thesis" is more formal.

---

#### 2. Asset Thesis / Asset Thesiss
**PRD Term:** ✅ **Asset Thesiss**  
**Existing Term:** ⚠️ **Underlying** (partial overlap, but different concept)  
**Database:** `asset_views` (Phase 1), `underlyings` (existing)  
**Definition:** Asset-specific theses with narrative, fundamental, positioning, and regime context. Expresses how a macro thesis applies to a specific asset, or independent asset-level beliefs.

**Usage:**
- Use "Asset Thesis" (singular) or "Asset Thesiss" (plural)
- Links to `underlyings` table (the instrument being viewed)
- Examples: "GLXY will outperform due to institutional adoption", "TSLA faces margin compression"

**Terminology Note:**
- **Underlying** (existing): The financial instrument itself (e.g., GLXY stock, TSLA stock). This is a **reference data** concept.
- **Asset Thesis**: The **belief/thesis** about that underlying. This is a **knowledge/belief** concept.
- **Relationship**: Asset Thesiss reference Underlyings. One underlying can have multiple asset thesiss over time.

**Example:**
- **Underlying**: "GLXY" (the ticker/instrument)
- **Asset Thesis**: "GLXY will outperform due to institutional adoption" (the belief about GLXY)

---

#### 3. Strategy / Strategies
**PRD Term:** ✅ **Strategies**  
**Existing Term:** ✅ **Strategies** (aligns)  
**Database:** `strategies` (existing)  
**Definition:** How asset thesiss are expressed tactically (options, duration, relative value, etc.). Includes risk frameworks and payoff expectations.

**Usage:**
- Use "Strategy" (singular) or "Strategies" (plural)
- Existing `strategies` table aligns with PRD concept
- Strategies express asset thesiss (or macro theses) through tactical implementation
- Examples: "Covered call on GLXY", "LEAPS risk reversal on TSLA"

**Related Terms:**
- **Strategy Template** (existing): Reusable strategy pattern. Not in PRD, but useful for implementation. Keep as-is.
- **Strategy Type** (existing): Classification like "LEAPS long call", "Covered call". Tactical concept, keep as-is.
- **State Code** (existing): Playbook state like "LC1", "RR2". Tactical workflow concept, keep as-is.

**⚠️ Critical Clarification: Strategy vs Thesis**
- **Strategies are tactical execution constructs**, not long-lived belief objects
- **Macro Theses and Asset Thesiss are belief objects** that evolve with evidence
- **Strategies link to theses/views** but remain tactical - their linkage is **additive, not redefining**
- A strategy can express an asset thesis, but the strategy itself is not the belief
- Example: "Covered call on GLXY" (strategy) expresses "GLXY will trade sideways" (asset thesis), but the strategy is the tactical implementation, not the belief itself

**Terminology Note:**
- PRD "Strategies" = existing "Strategies" ✅
- Existing system has additional tactical concepts (templates, state codes) that are implementation details, not PRD concepts
- **Do not confuse strategies with theses/views** - they serve different roles in the hierarchy

---

#### 4. Position / Positions
**PRD Term:** ✅ **Positions**  
**Existing Term:** ✅ **Positions** (aligns)  
**Database:** `positions` (existing)  
**Definition:** Individual trades and live exposures. Execution, lifecycle, and risk management.

**Usage:**
- Use "Position" (singular) or "Positions" (plural)
- Existing `positions` table aligns with PRD concept
- Positions are the execution layer of strategies

**Related Terms:**
- **Trade** (existing): Individual execution event. Positions are aggregates of trades. Keep distinction.

---

## Workflow & Decision Terms

### Triage
**PRD Term:** ✅ **Triage**  
**Existing Term:** ✅ **Triage** (aligns perfectly)  
**Database:** `triage_records` (existing)  
**Definition:** Process that evaluates urgency, severity, and required action when a trigger fires. Separates evaluation from action.

**Usage:**
- Use "Triage" (noun) or "Triage Process" (verb form: "to triage")
- Existing `triage_records` table aligns with PRD concept
- Triage produces evaluation; actions are captured separately

**Related Terms:**
- **Triage Record**: Individual triage evaluation (database term)
- **Triage Queue** / **Action Items**: UI term for list of items requiring attention
- **Severity**: Priority level (urgent, attention, monitor, info, pending, complete)

**Terminology Note:**
- ✅ **Keep "Triage"** in code/database/docs - aligns perfectly with PRD
- ✅ **Use "Action Items"** in UI labels - more user-friendly and intuitive
- **Distinction**: "Triage" = the evaluation process; "Action Items" = the user-facing queue
- Existing implementation matches PRD concept; UI can evolve to use "Action Items"

---

### Blotter → Journal / Decision Log
**PRD Term:** ✅ **Journal** (or "Institutional Memory")  
**Existing Term:** ⚠️ **Blotter** (tactical term, needs evolution)  
**Database:** `blotter_actions` (existing, may evolve)  
**Definition:** Chronological log of all triggers, triage outcomes, decisions, and actions. Supports retrospective analysis, performance attribution, pattern detection.

**Usage:**
- **Current**: Use "Blotter" for existing functionality (backward compatibility)
- **Future**: Use "Journal" or "Decision Log" for PRD-aligned terminology
- **Transition**: Gradually introduce "Journal" terminology in new features, maintain "Blotter" for existing UI/database

**Terminology Mapping:**
- **Blotter** (existing): Tactical term from trading. Captures actions/decisions.
- **Journal** (PRD): Broader concept including triggers, triage, decisions, outcomes, retrospectives.
- **Decision Log** (alternative): More explicit about decision focus.

**Recommendation:**
- **Database**: Keep `blotter_actions` table name (backward compatibility)
- **UI Labels**: Can evolve to "Journal" or "Decision Log" gradually
- **Code Comments/Docs**: Use "Journal" or "Decision Log" when referring to PRD concept
- **API**: Consider `/api/journal` as alias for `/api/blotter` (future)

**Related Terms:**
- **Blotter Action**: Individual entry in journal (database term, keep as-is)
- **Decision**: Explicit decision captured in journal (PRD concept, currently implicit)
- **Action**: What was done (TRADE, MONITOR, DISMISS, UPDATE)

---

### Decision
**PRD Term:** ✅ **Decision**  
**Existing Term:** ⚠️ **Blotter Action** (implicit, needs explicit modeling)  
**Database:** `blotter_actions` (existing, will be enhanced)  
**Definition:** Explicit record of a decision made in response to a trigger/triage. Includes rationale, confidence, expected outcome. Decisions can be: take action (trade), update thesis/metadata, record observation, explicitly take no action.

**Usage:**
- Use "Decision" when referring to PRD concept
- Use "Blotter Action" when referring to existing database/implementation
- Decisions are captured in `blotter_actions` table (enhanced in Phase 1)

**Terminology Mapping:**
- **Blotter Action** (existing): Tactical action record
- **Decision** (PRD): Explicit decision with rationale, confidence, outcome tracking

**Recommendation:**
- **Enhance `blotter_actions`** with decision fields (rationale, confidence, outcome)
- **Use "Decision"** in new code/documentation when referring to PRD concept
- **Keep "Blotter Action"** for database/legacy references

---

### Trigger
**PRD Term:** ✅ **Trigger**  
**Existing Term:** ⚠️ **Triage Rule** (implicit, needs explicit modeling)  
**Database:** `triage_records` (existing), `workflow_triggers` (Phase 4)  
**Definition:** Event that initiates triage process. Can be time-based (scheduled reviews), event-based (news, expiries, price moves), or rule-based (PnL thresholds, risk metrics). Triggers exist at all hierarchy levels.

**Usage:**
- Use "Trigger" when referring to PRD concept
- Use "Triage Rule" when referring to existing rule-based logic
- Triggers are currently computed (implicit); will become first-class entities (Phase 4)

**Terminology Mapping:**
- **Triage Rule** (existing): Rule that produces triage records (e.g., "DTE <= 21 for short options")
- **Trigger** (PRD): Broader concept including time-based, event-based, and rule-based

**Recommendation:**
- **Use "Trigger"** in new code/documentation
- **Keep "Triage Rule"** for existing rule-based logic
- **Evolve to first-class triggers** in Phase 4

---

## Research & Knowledge Terms

### Research
**PRD Term:** ✅ **Research**  
**Existing Term:** ❌ None (new concept)  
**Database:** `research_artifacts`, `research_insights` (Phase 2)  
**Definition:** Information that informs investment beliefs and decisions. Includes articles, transcripts, notes, reports. Treated as living input to decision-making, not static documentation.

**Usage:**
- Use "Research" (singular) or "Research" (plural, same form)
- Types: articles, transcripts, notes, reports
- Research is ingested, structured, and mapped to hierarchy

**Related Terms:**
- **Research Artifact**: Raw research content (ingested material)
- **Research Insight**: Structured research (after AI processing)
- **Research Mapping**: Link between research and hierarchy (thesis/view/strategy/position)

**⚠️ AI Framing: Proposals, Not State Transitions**
- **AI outputs are always proposals**, never automatic state transitions
- AI may suggest mappings, classifications, or evaluations, but **human approval is required**
- AI assists with structuring and evaluation, but does not create/retire theses or trigger trades
- Example: AI suggests "This research supports Macro Thesis X" → User reviews and approves/rejects
- **Principle**: AI is assistive and evaluative, not authoritative (per PRD Section 5.7)

---

### Research Artifact
**PRD Term:** ✅ **Research Artifact** (implied)  
**Existing Term:** ❌ None (new concept)  
**Database:** `research_artifacts` (Phase 2)  
**Definition:** Raw research material before structuring. Articles, transcripts, notes, reports in their original form.

**Usage:**
- Use "Research Artifact" or "Artifact" (when context is clear)
- Artifacts are ingested and then processed into insights

---

### Research Insight
**PRD Term:** ✅ **Structured Research Insight**  
**Existing Term:** ❌ None (new concept)  
**Database:** `research_insights` (Phase 2)  
**Definition:** Research after AI-assisted structuring. Includes summary, claims, evidence, counter-evidence, time horizon, confidence level.

**Usage:**
- Use "Research Insight" or "Insight" (when context is clear)
- Insights are mapped to hierarchy (theses, views, strategies, positions)

---

### Research Mapping
**PRD Term:** ✅ **Contextual Mapping**  
**Existing Term:** ❌ None (new concept)  
**Database:** `research_mappings` (Phase 2)  
**Definition:** Link between research insight and hierarchy element (macro thesis, asset thesis, strategy, or position). Records whether research supports, refutes, is neutral, or exploratory.

**Usage:**
- Use "Research Mapping" or "Mapping" (when context is clear)
- Mapping types: `supports`, `refutes`, `neutral`, `exploratory`

---

## Execution & Data Terms

### Trade / Trades
**PRD Term:** ✅ **Trades**  
**Existing Term:** ✅ **Trades** (aligns)  
**Database:** `trades` (existing)  
**Definition:** Individual execution events from brokers. Normalized into canonical model.

**Usage:**
- Use "Trade" (singular) or "Trades" (plural)
- Existing `trades` table aligns with PRD concept
- Trades aggregate into positions

**Terminology Note:**
- ✅ **Keep "Trades"** - aligns with PRD

---

### Position / Positions
**PRD Term:** ✅ **Positions**  
**Existing Term:** ✅ **Positions** (aligns)  
**Database:** `positions` (existing)  
**Definition:** Live exposures aggregated from trades. Mark-to-market, lifecycle management.

**Usage:**
- Use "Position" (singular) or "Positions" (plural)
- Existing `positions` table aligns with PRD concept
- Positions are current state; trades are historical events

**Terminology Note:**
- ✅ **Keep "Positions"** - aligns with PRD

---

### Underlying / Underlyings
**PRD Term:** ⚠️ Not explicitly defined (but referenced)  
**Existing Term:** ✅ **Underlying** (reference data concept)  
**Database:** `underlyings` (existing)  
**Definition:** Financial instrument being traded (stock, ETF, etc.). Reference data that identifies the asset.

**Usage:**
- Use "Underlying" (singular) or "Underlyings" (plural)
- This is **reference data**, not a belief/thesis
- Examples: "GLXY", "TSLA", "SPY"

**Terminology Note:**
- **Underlying** = the instrument (reference data)
- **Asset Thesis** = the belief about that underlying (knowledge/belief)
- ✅ **Keep "Underlying"** - useful reference data concept, even if not explicitly in PRD

---

### Account / Accounts
**PRD Term:** ⚠️ Not explicitly defined (but implied)  
**Existing Term:** ✅ **Account** (implementation concept)  
**Database:** `accounts` (existing)  
**Definition:** Brokerage account. Organizational unit for trades, positions, strategies.

**Usage:**
- Use "Account" (singular) or "Accounts" (plural)
- This is an **organizational/implementation** concept, not a PRD hierarchy level
- ✅ **Keep "Account"** - necessary for implementation

---

## Tactical Terms (Not in PRD, but Keep)

These terms are implementation details that don't appear in PRD but are useful for the system.

### Strategy Template
**PRD Term:** ❌ Not in PRD  
**Existing Term:** ✅ **Strategy Template**  
**Database:** `strategy_templates` (existing)  
**Definition:** Reusable strategy pattern. Canonical definition of a strategy type.

**Usage:**
- Keep as-is for implementation
- Not a PRD concept, but useful for organizing strategies
- ✅ **Keep "Strategy Template"**

---

### State Code
**PRD Term:** ❌ Not in PRD  
**Existing Term:** ✅ **State Code**  
**Database:** `playbook_items.code` (existing)  
**Definition:** Playbook state identifier like "LC1", "RR2". Tactical workflow state.

**Usage:**
- Keep as-is for implementation
- Not a PRD concept, but useful for options trading workflow
- ✅ **Keep "State Code"**

---

### Playbook
**PRD Term:** ❌ Not in PRD  
**Existing Term:** ✅ **Playbook**  
**Database:** `playbook_items` (existing)  
**Definition:** Tactical rules and actions for strategy states. Options trading workflow.

**Usage:**
- Keep as-is for implementation
- Not a PRD concept, but useful for tactical workflow
- ✅ **Keep "Playbook"**

---

## Summary: Terminology Mapping

### ✅ Terms That Align (Keep As-Is)
- **Strategies** - PRD and existing align
- **Positions** - PRD and existing align
- **Trades** - PRD and existing align
- **Triage** - PRD and existing align perfectly
- **Underlying** - Useful reference data concept (keep)

### ⚠️ Terms That Need Evolution
- **Blotter** → **Journal** or **Decision Log** (gradual transition)
  - Database: Keep `blotter_actions` (backward compatibility)
  - UI: Can evolve to "Journal" gradually
  - Code/Docs: Use "Journal" for PRD concept
- **Blotter Action** → **Decision** (enhance with decision fields)
  - Keep database name, add decision concept
- **Triage Rule** → **Trigger** (evolve to first-class entity)
  - Keep existing rules, add trigger concept

### ❌ New Terms (No Existing Equivalent)
- **Macro Thesis** / **Macro Theses** (new)
- **Asset Thesis** / **Asset Thesiss** (new)
- **Research** / **Research Artifact** / **Research Insight** (new)
- **Research Mapping** (new)
- **Decision** (explicit concept, currently implicit)

### ✅ Tactical Terms (Keep, Not in PRD)
- **Strategy Template** (implementation detail)
- **State Code** (tactical workflow)
- **Playbook** (tactical workflow)
- **Account** (organizational concept)

---

## Usage Guidelines

### When Writing Code
1. **Use PRD terms** in new code when referring to PRD concepts
2. **Keep existing terms** for database tables/columns (backward compatibility)
3. **Add comments** mapping tactical terms to PRD concepts where helpful
4. **Use "Journal"** instead of "Blotter" in new functions/variables when referring to PRD concept

### When Writing Documentation
1. **Use PRD terms** as primary terminology
2. **Map to existing terms** in parentheses when first introducing concept
3. **Clarify distinctions** (e.g., Underlying vs Asset Thesis)
4. **Note tactical terms** that are implementation details

### When Writing UI Labels
1. **Gradual evolution**: Can introduce "Journal" alongside "Blotter"
2. **Tooltips/help text**: Explain terminology where helpful
3. **Consistency**: Use same term throughout a feature/page

### When Communicating
1. **Use PRD terms** for strategic discussions
2. **Use existing terms** when referring to current implementation
3. **Clarify context** when term could be ambiguous

### When Constructing AI Prompts
1. **Always use PRD terminology** in prompts (e.g., "asset thesis", "macro thesis")
2. **Map from legacy data** internally - AI should see PRD terms, not implementation terms
3. **Example**: Prompt says "asset thesis" even if querying `strategies` table that will link to `asset_views`
4. **Rationale**: AI should reason about PRD concepts, not implementation details

### Stability Guarantee
1. **PRD terminology is stable by default** - only changes via explicit PRD revision
2. **Tactical/implementation terminology may evolve** as needed for clarity or technical reasons
3. **When PRD terms change**: Update this document and all references systematically
4. **When tactical terms change**: Update code/docs, but PRD alignment remains primary

---

## Examples: Correct Usage

### ✅ Correct
- "The **macro thesis** 'Inflation remains elevated' links to multiple **asset thesiss**"
- "**Triage** evaluates urgency and severity; **decisions** are captured in the **journal**"
- "**Research insights** are mapped to **asset thesiss** to support or refute beliefs"
- "The **underlying** GLXY has an **asset thesis** that supports the **macro thesis**"

### ❌ Incorrect (Common Confusions)
- ❌ "The underlying view" → ✅ "The asset thesis about the underlying"
- ❌ "Blotter actions are decisions" → ✅ "Blotter actions capture decisions" (or "Decisions are recorded in the journal")
- ❌ "Triage rules trigger actions" → ✅ "Triggers initiate triage; triage produces decisions"

---

## Future Evolution

### Phase 1
- Introduce "Macro Thesis" and "Asset Thesis" terminology
- Enhance "Blotter Action" with "Decision" concept
- Keep all existing database/UI terms (backward compatibility)

### Phase 2
- Introduce "Research", "Research Artifact", "Research Insight" terminology
- Introduce "Research Mapping" terminology

### Phase 4
- Introduce "Trigger" as first-class entity (alongside existing "Triage Rule")
- Evolve "Blotter" UI labels to "Journal" (optional, gradual)

---

## Key Clarifications Summary

### Strategy vs Thesis
- **Strategies** = tactical execution constructs (options, duration, relative value)
- **Macro Theses / Asset Thesiss** = long-lived belief objects that evolve with evidence
- Strategies link to theses/views but remain tactical - linkage is additive, not redefining
- Do not confuse strategies with theses/views - they serve different roles

### AI Framing
- **AI outputs are always proposals**, never automatic state transitions
- AI assists with structuring and evaluation, but human approval is required
- AI does not create/retire theses or trigger trades automatically
- Principle: AI is assistive and evaluative, not authoritative

### Terminology Stability
- **PRD terminology is stable by default** - only changes via explicit PRD revision
- Tactical/implementation terminology may evolve as needed
- When constructing AI prompts, always use PRD terminology
- Map from legacy data internally - AI should see PRD concepts, not implementation details

---

**Document Status:** Authoritative reference for all future development.

