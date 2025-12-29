# Universal Investment Operating System  
## Product Requirements Document (PRD)

**Version:** v1.1  
**Status:** Locked (Vision Reference)  
**Owner:** Product / Founder  

---

## 1. Product Vision & Purpose

The Universal Investment Operating System is designed to help an individual investor or investment business manage their entire investment universe—from long-term macro beliefs to day-to-day tactical position management—within a single coherent system.

The platform integrates:

- Quantitative data (positions, trades, prices, risk metrics)
- Qualitative knowledge (theses, narratives, research, beliefs)
- Workflow orchestration (triggers, triage, actions)
- Decision support (analytics, synthesis, prioritisation)
- Institutional-grade memory (logging, journaling, retrospectives)

The objective is not merely to track performance, but to systematically improve **decision quality over time** by closing the loop between beliefs, actions, outcomes, and learning.

---

## 2. Target Users

### Primary Users
- Sophisticated individual investors
- Portfolio managers / CIOs
- Small investment firms or family offices

### Secondary Users (Future)
- Analysts contributing research
- Partners or collaborators with partial visibility
- Advisors or allocators (read-only)

---

## 3. Conceptual Model (Decision Hierarchy)

The system is structured as an explicit hierarchical decision model:

1. **Macro Theses**
   - Secular, cyclical, or structural beliefs
   - Cross-asset and non-asset-specific
   - Periodically re-underwritten

2. **Asset Thesiss**
   - Asset-specific theses
   - Narrative, fundamental, positioning, and regime context

3. **Strategies**
   - How views are expressed (options, duration, relative value, etc.)
   - Risk frameworks and payoff expectations

4. **Positions**
   - Individual trades and live exposures
   - Execution, lifecycle, and risk management

Every object in the system has a clear position within this hierarchy and inherits contextual meaning from higher levels.

---

## 4. Data Ingestion & Normalisation

The system ingests data from multiple brokers, exchanges, custodians, and platforms, including:

- Trades
- Positions
- Cash balances
- Prices and market data

All data is normalised into a canonical internal model that supports:
- Cross-asset analysis
- Historical reconstruction of portfolio state
- Longitudinal performance and risk analysis

---

## 5. Research, Knowledge & Intelligence Layer

### 5.1 Purpose

The platform includes a first-class research and knowledge system designed to ingest, structure, evaluate, and contextualise information that informs investment beliefs and decisions across all levels of the hierarchy.

Research is treated as a living input to decision-making, not static documentation.

---

### 5.2 Research Ingestion

The system supports ingestion of diverse research inputs, including but not limited to:

- Articles and written commentary
- Interview, podcast, and video transcripts
- User-generated notes and observations
- Market commentary and reports

Ingested research is treated as raw material rather than immediately accepted conclusions.

---

### 5.3 AI-Assisted Structuring & Extraction

AI is used to assist with:

- Summarisation of raw research
- Extraction of key claims and narratives
- Identification of supporting evidence and counter-evidence
- Tagging of time horizons and confidence levels

The output of this process is structured research insights, not unstructured text.

---

### 5.4 Contextual Mapping to the Investment Hierarchy

Structured research insights are evaluated and mapped to:

- Macro theses
- Asset views
- Strategies
- Positions

For each mapping, the system explicitly records whether the research:

- Supports existing beliefs
- Refutes or challenges them
- Is neutral or exploratory

Mappings are transparent and inspectable by the user.

---

### 5.5 Thesis Evaluation & Re-Underwriting

The system is explicitly designed to support ongoing thesis evaluation.

New research may:

- Reinforce confidence in a thesis
- Introduce contradictions or tension
- Trigger a formal review or re-underwriting workflow

Beliefs are treated as living objects that evolve with evidence.

---

### 5.6 Pre-Investment & Exploratory Research

Research that cannot be confidently mapped to an existing thesis, asset thesis, strategy, or position is retained within a pre-investment research state.

This supports:

- Exploration of new macro ideas
- Incubation of potential asset theses
- Accumulation of evidence prior to capital allocation

This allows ideas to mature without forcing premature investment decisions.

---

### 5.7 Role of AI

AI within the system is assistive and evaluative, not authoritative.

AI may:
- Surface relationships and inconsistencies
- Highlight missing evidence
- Stress-test beliefs and rationales
- Suggest potential patterns and connections (see Section 8.1)

AI does not:
- Automatically create or retire theses
- Automatically trigger trades
- Override human judgment
- Declare patterns as definitive — AI suggests, humans evaluate

**Pattern Recognition:**
- AI may identify potential patterns across time and suggest connections
- AI serves as a pattern suggester, not a pattern declarer
- Human judgment determines which patterns represent "rational synthesis" versus "seeing patterns in noise"

---

## 6. Workflow & Triage Engine

### 6.1 Triggers

Triggers may be:

- Time-based (scheduled reviews)
- Event-based (news, expiries, price moves)
- Rule-based (PnL thresholds, risk metrics)

Triggers exist at all levels of the hierarchy.

---

### 6.2 Triage

Each trigger produces a triage process that evaluates:

- Urgency
- Severity
- Required action (if any)

Possible outcomes include:

- Take action (trade)
- Update thesis or metadata
- Record observation
- Explicitly take no action

---

## 7. Decision Support & Analytics

When a decision is required, the system provides contextual decision support, including:

- Options and payoff analytics
- Technical analysis
- Risk and exposure views
- Synthesis of relevant research and prior decisions

The goal is to reduce cognitive load while improving decision quality.

---

## 8. Logging, Journal & Institutional Memory

All triggers, triage outcomes, decisions, and actions are logged in a chronological journal.

This institutional memory supports:

- Retrospective analysis
- Performance attribution
- Pattern and bias detection
- Continuous improvement of decision-making processes

### 8.1 Time-Based Reflection & Learning

The system supports structured time-based reflection to enable learning across time horizons.

**Review Workflows:**
- Decisions are revisited in structured reviews (weekly, monthly, quarterly, or custom intervals)
- Reviews synthesize events, decisions, and outcomes within a time period
- Reviews connect present decisions to past experiences and future implications

**Memory Across Regimes:**
- The system maintains context across different market regimes and time periods
- Historical comparisons enable recognition of similar structures and conditions
- Memory persists across strategy lifecycles, enabling long-term pattern recognition

**Pattern Recognition:**
- Patterns across time are surfaced deliberately, not as noise
- The system supports "rational synthesis" — connecting past events to present decisions through explicit reasoning
- Pattern recognition is a first-class learning objective, enabling recognition of recurring market structures
- AI may suggest potential patterns, but human judgment determines which patterns are meaningful

**"This Reminds Me Of..." Reasoning:**
- The system enables explicit connections between current situations and past experiences
- Users can link events, decisions, and outcomes across time
- These connections support learning by making implicit knowledge explicit

### 8.2 Event Logging & Context Capture

The system captures significant events and contextual information that inform decision-making and learning.

**Event Logging:**
- Significant market events, policy changes, and structural shifts are logged
- Trade decisions and reasoning are captured at decision time, not in hindsight
- Events are linked to relevant theses, views, strategies, and positions

**Contextual Metadata:**
- Decisions are made under specific emotional and contextual conditions
- The system allows qualitative metadata (including emotional context) to be captured alongside quantitative data
- Capturing emotional and contextual data at decision time may improve learning and pattern recognition
- The system does not prescribe specific taxonomies or mandatory logging — users choose what context to capture

**Integration with Decision Loop:**
- Contextual data enriches the journal and retrospective analysis
- Emotional and contextual patterns can be analyzed alongside quantitative outcomes
- This supports the PRD principle: "Decisions over outcomes, outcomes over ego"

---

## 9. Visualisation & Attention Management

The system provides visual tools designed to answer:

> “What matters most right now?”

These include:

- Priority dashboards
- Heatmaps and risk visualisations
- Hierarchical maps
- Timelines and alerts

---

## 10. Design Principles

- Explicit beliefs over implicit assumptions
- Decisions over outcomes, outcomes over ego
- Qualitative and quantitative parity
- Memory and learning as competitive advantage

---

## 11. Non-Goals (v1)

- Fully automated trading
- Alpha prediction
- Social or copy trading
- Retail gamification

---

## 12. Future Extensions (Indicative)

- Collaboration and permissions
- Scenario simulation
- Adversarial / naysayer AI
- Cross-portfolio analytics