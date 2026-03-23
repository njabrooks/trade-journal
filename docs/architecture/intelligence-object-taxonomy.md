# Intelligence Object Taxonomy

Unified conceptual model for all intelligence flowing through the system. The core principle: **what an item IS** (intrinsic) is separate from **what role it PLAYS** (relational). Labels should never conflate these.

---

## Part 1: What an Item IS (Intrinsic Properties)

Every piece of intelligence has properties that belong to it regardless of how it's used in the system. These don't change when the item gets linked to theses, signals, or other objects.

### Intrinsic Property: Structure

How the item is composed:

| Structure | Description | Examples | Current table(s) |
|-----------|-------------|---------|-------------------|
| **Data point** | Single fact or measurement | "NVDA Q4 EPS: $5.16", "10Y yield: 4.25%", "Goldman upgrades NVDA" | `analyst_actions`, `earnings_events`, `economic_events`, `fred_observations`, `insider_transactions` |
| **Document** | Filing or report with structured content | "NVDA 10-K FY2026", "World Monitor: March 23 2026" | `sec_filings`, `intelligence_reports` |
| **Research finding** | Toulmin-structured argument (assertion + evidence + reasoning + backing + qualifier + rebuttal) | "GPU demand exceeds supply through 2027 [evidence: TSMC capex, datacenter orders...]" | `main_claims` (via `research_insights.claims_structure`) |
| **Criterion** | Conditional statement with monitoring config | "If major analyst upgrades occur, thesis is strengthening" | `signals` (with `explicit_details` for data source config) |

### Intrinsic Property: Factuality

The epistemic status of what the item asserts:

| Factuality | Description | Examples |
|------------|-------------|---------|
| **Fact** | Verifiable, objective, happened | "TSMC capex increased 30% in Q1 2026", "NVDA Q4 EPS: $5.16" |
| **Report** | Attributed to a source (the attribution is factual; the content is opinion) | "Goldman upgrades NVDA to Buy", "Fed signals two rate cuts" |
| **Analysis** | Interpretation or reasoning about facts | "AI capex is secular, not cyclical — driven by competitive necessity" |
| **Projection** | Forward-looking assertion about what will happen | "GPU demand will exceed supply through 2027" |
| **Conditional** | If-then statement about what would indicate something | "If hyperscaler capex guidance is revised down, thesis weakens" |

Note: A single research finding can contain a mix — a factual claim supported by factual evidence with analytical reasoning and a projective conclusion. Factuality is a property of each statement within the item, not always of the item as a whole.

### Intrinsic Property: Source

Where the item originated:

| Source type | Description | Entry mechanism |
|------------|-------------|-----------------|
| **Market data feed** | Automated ingestion from financial APIs | GitHub Actions scheduled jobs |
| **Intelligence report** | AI-generated briefings (World Monitor, Thesis Monitor) | Scheduled agent → `ingest-world-monitor.ts` |
| **Research processing** | User-initiated analysis of content | `/process-inbox` skill → Toulmin extraction |
| **User input** | Direct user annotation or creation | Manual via UI or CLI scripts |

### Other Intrinsic Properties

- **Tickers** — which assets/underlyings the item relates to
- **Occurred at** — when the event/finding happened or was published
- **Severity/impact** — how significant (critical/high/medium/info)
- **Content** — headline, body, structured data fields

---

## Part 2: What Role an Item PLAYS (Relational)

An item acquires roles when it's linked to objects in the belief and execution hierarchy. The **same item** can play **multiple roles simultaneously**. Roles don't change what the item is — they describe how it functions in the system.

### Role: Thesis Evidence

**What it means:** The item supports, refutes, or provides foundation for a thesis.

**Current mechanism:** `claim_thesis_mappings` junction table with `mapping_type` (supports / refutes / foundation)

**Who assigns it:** User (manual link or accepts AI suggestion)

**Which items play this role:** Primarily research findings (`main_claims`), but conceptually any item could. A factual data point like "TSMC capex up 30%" is thesis evidence when a user decides it supports a thesis.

**Lifecycle connection:** Primary role during thesis **developing** phase.

### Role: Monitoring Criterion

**What it means:** The item defines a condition being watched to evaluate thesis validity.

**Current mechanism:** `signals` table + `signal_entity_links` junction table

**Who assigns it:** `build-core-argument` skill generates criteria from thesis evidence; user can also create manually.

**Which items play this role:** Criterion-structured items (`signals`). These are derived FROM thesis evidence — the `build-core-argument` skill synthesizes linked research findings into an articulation, then extracts forward-looking criteria.

**Lifecycle connection:** Created at the developing → monitoring transition. Primary role during thesis **monitoring** phase.

### Role: Criterion Evidence

**What it means:** The item bears on whether a monitoring criterion is being met.

**Current mechanism:** `signal_data_snapshots` table (with `assessment`: strengthening / weakening / confirmed / invalidated / neutral)

**Who assigns it:**
- Automated: thesis monitor scoring (`generateQualitativeSnapshots`), quantitative collection (`collect-signal-data.ts`)
- Skill: `assess-validation-evidence` (human-guided)
- Proposed: intelligence routing (automated scoring of feed items against criteria)

**Which items play this role:** Any item can become criterion evidence. A data point ("earnings beat by 15%") becomes criterion evidence when scored against a monitoring criterion ("fundamental strength improving"). A research finding can also become criterion evidence when routed through `assess-validation-evidence`.

**Lifecycle connection:** Accumulates during thesis **monitoring** phase.

### Role: Intel

**What it means:** The item is relevant to an entity (thesis, strategy, signal) but doesn't directly serve as thesis evidence or signal evidence. This is **entity-relevant context**, not just ticker-relevant — relevance can be resolved through any attribute that connects the item to the entity.

**Relevance resolution by entity type:**
| Entity type | How relevance is determined |
|---|---|
| Asset thesis | Ticker match (primary), sector overlap |
| Macro thesis | Sector/theme match, keyword overlap, linked asset thesis tickers — a macro thesis about inflation cares about CPI data even if no single ticker is involved |
| Strategy | Underlying ticker, strategy type keywords |
| Signal | Monitor keywords from `explicit_details`, linked thesis tickers/sectors |

**Current mechanism:** `thesis_news_items` table (exists but currently unused)

**Who assigns it:** Proposed: automated entity-relevance resolution during intelligence routing (extending ticker resolution to include sector, theme, and keyword matching).

**Which items play this role:** Any item that matches an entity by any relevance dimension but doesn't score against active signals (monitoring phase) or match developing-phase evidence needs. "NVDA files routine 10-Q" is intel for an NVDA asset thesis. "US CPI comes in below expectations" is intel for an inflation macro thesis. Both are entity-relevant context without being direct evidence.

**Lifecycle connection:** Relevant in both developing and monitoring phases.

### Role: Unassigned

**What it means:** The item has entered the system but hasn't been evaluated for any role yet.

**Current mechanism:** Items sit in their source tables, displayed in the unified feed.

**Who assigns it:** N/A — this is the default state.

**Which items play this role:** Currently, most items from market data feeds (analyst actions, earnings, SEC filings, economic events, insider transactions) are permanently unassigned. This is the gap we're addressing.

---

## Part 3: The Confusion in Current Terminology

Current labels conflate item and role:

| Current term | What it actually refers to | Item or role? | Finalized label |
|-------------|---------------------------|---------------|---------------|
| "Claim" | A Toulmin-structured research finding | Item | **Claim** (keep — the Toulmin structure defines it, not its certainty) |
| "Claim linked to thesis" | A claim playing the evidence role for a thesis | Role | **Thesis Evidence** |
| "Signal" | A conditional criterion being monitored | Item | **Signal** (keep — the ambiguity resolves because evidence gets its own label) |
| "Signal evidence" / "signal data snapshot" | An item scored against a signal | Role | **Signal Evidence** |
| "Intelligence item" | A data point from world/thesis monitor | Item | **Data point** |
| "News item" / contextual | An item relevant to an entity by ticker | Role | **Intel** |

The word **"claim"** is especially overloaded:
- In Toulmin: "claim" = the main assertion (a structural element)
- In the app: "claim" = a research finding (an item type)
- In conversation: "claim" = an uncertain assertion (a factuality property)
- When linked: "claim supporting thesis X" = thesis evidence (a role)

A factual statement like "TSMC capex increased 30%" is a research finding (item) that can serve as thesis evidence (role). Calling it a "claim" implies uncertainty, but the item itself is factual. The uncertainty lives in the THESIS it supports, not in the item.

---

## Part 4: Item-Role Matrix

Mapping which item types can play which roles:

| Item type | Thesis Evidence | Signal (criterion) | Signal Evidence | Intel |
|-----------|:-:|:-:|:-:|:-:|
| Data point (analyst, earnings, economic, insider, SEC, FRED) | Rare (would need Toulmin enrichment) | No | Yes (automated scoring) | Yes (ticker match) |
| Data point (world/thesis monitor) | Rare | No | Yes (automated scoring) | Yes (ticker match) |
| Claim (Toulmin-structured) | Yes (primary use) | No | Yes (via assess-validation-evidence) | Rare |
| Signal (conditional criterion) | No | Yes (primary use) | No (signals don't evidence other signals) | No |

**Key insight from this matrix:**
- Claims primarily serve as **thesis evidence** (developing phase)
- Data points primarily serve as **signal evidence** (monitoring phase)
- Signals are derived FROM thesis evidence (the bridge between phases — `build-core-argument` synthesizes claims into signals)
- Intel is the catch-all for ticker-relevant items that don't fit the evidence roles

---

## Part 5: The Complete Flow

```
ITEMS ENTER                    ITEMS ACQUIRE ROLES              ROLES SERVE THE
THE SYSTEM                     (through evaluation/linking)     EXECUTION LAYER
───────────                    ────────────────────────          ──────────────────

Market data feeds ──┐
(analyst, earnings,  │         ┌─────────────────────┐
 economic, SEC,      ├────────►│                     │
 insider, FRED)      │  eval   │  THESIS EVIDENCE    │  supports/     ┌──────────┐
                     │  ┌─────►│  (developing phase) │──refutes─────►│          │
Intelligence         │  │      │                     │               │ THESES   │
reports ─────────────┤  │      └──────────┬──────────┘               │ (macro/  │
                     │  │                 │                           │  asset)  │
Research ────────────┘  │                 │ build-core-argument       │          │
  │                     │                 │ synthesizes into          └────┬─────┘
  │ /process-inbox      │                 ▼                                │
  │ extracts            │      ┌─────────────────────┐                    │
  ▼                     │      │                     │  monitors          │
Research findings       │      │ MONITORING CRITERIA  │──validity──►      │
(Toulmin-structured) ───┘      │ (monitoring phase)  │  of                │
                               │                     │                    │
                               └──────────┬──────────┘               ┌────┴─────┐
                                          │                          │STRATEGIES│
                     eval                 │ scored against           └────┬─────┘
All items ──────────────────────┐         │                               │
                                ▼         ▼                          ┌────┴─────┐
                     ┌─────────────────────┐                         │POSITIONS │
                     │                     │                         └──────────┘
                     │ CRITERION EVIDENCE   │
                     │ (monitoring phase)   │
                     │                     │
                     └─────────────────────┘

                     ┌─────────────────────┐
All items with ─────►│                     │
ticker match         │ CONTEXTUAL INTEL    │
                     │ (both phases)       │
                     └─────────────────────┘
```

---

## Part 6: What This Means for UI Standardisation

### Same across all roles:
1. **Item display**: Regardless of role, an item's intrinsic properties (headline, source badge, tickers, timestamp, factuality) are displayed consistently using the same component
2. **Role assignment UI**: Linking an item to a thesis as evidence should use the same interaction pattern as linking an item to a signal as criterion evidence — the action is "assign this role", just with different parameters
3. **Provenance**: Every role assignment shows who/what assigned it (user, skill, automation) using the same provenance badge
4. **Assessment vocabulary**: strengthening / weakening / confirmed / invalidated / neutral applies to ALL evidence roles (thesis evidence and criterion evidence use the same language)

### Different by role:
1. **Thesis evidence** — shown on thesis pages during developing phase; user assigns via suggestion acceptance or manual link; relationship type (supports/refutes/foundation) is unique to this role
2. **Monitoring criterion** — shown on thesis pages during monitoring phase; generated by build-core-argument; has data source configuration unique to this role
3. **Criterion evidence** — shown on signal/criterion detail views; can be automated; has assessment + quantitative data unique to this role
4. **Contextual intelligence** — shown on entity pages as a news stream; fully automated (ticker resolution); lightest-weight role, no assessment needed

### Different by item structure:
1. **Data points** — compact display (one-line: source icon, headline, value, ticker)
2. **Research findings** — expandable display (Toulmin structure: assertion, evidence list, reasoning, qualifier)
3. **Monitoring criteria** — display with assessment timeline, data source config, importance level

### The repeating UI components needed:
| Component | Used for | Consistent across |
|-----------|---------|-------------------|
| **Item card** | Displaying any item's intrinsic properties | Claims, data points, signals |
| **Role badge** | Showing what role(s) an item plays | Thesis Evidence, Signal Evidence, Intel |
| **Evidence link** | Connecting an item to a thesis or signal | Thesis Evidence + Signal Evidence roles |
| **Assessment indicator** | Showing strengthening/weakening/etc | Both evidence roles |
| **Provenance badge** | Showing who/what assigned a role | All role assignments |
| **Lifecycle phase indicator** | Showing developing/monitoring on thesis | Thesis pages |

---

## Part 7: Mapping Current Schema to This Model

| Current table | Item type | Default role | Notes |
|--------------|-----------|-------------|-------|
| `main_claims` | Research finding | Thesis evidence (when linked via `claim_thesis_mappings`) | Currently conflates item and role. The Toulmin structure is the item; the thesis mapping is the role. |
| `signals` | Criterion | Monitoring criterion (always, via `signal_entity_links`) | Currently conflates item and role. The conditional statement is the item; the thesis monitoring link is the role. |
| `signal_data_snapshots` | (N/A — this IS the role link, not an item) | Criterion evidence | This table records the evidence relationship, not the item itself. The item is the observation that was scored. |
| `analyst_actions` | Data point | Unassigned (displayed in feed only) | Gap: should be evaluable for criterion evidence and contextual roles |
| `earnings_events` | Data point | Unassigned | Same gap |
| `economic_events` | Data point | Unassigned | Same gap |
| `sec_filings` | Document | Unassigned | Same gap |
| `insider_transactions` | Data point | Unassigned | Same gap |
| `fred_observations` | Data point | Partially assigned (threshold breaches) | Some linked to signals via `thesis_fred_indicators` |
| `intelligence_items` | Data point / analysis | Partially assigned (thesis monitor → criterion evidence) | World monitor items are mostly unassigned |
| `intelligence_atoms` (proposed) | Normalized cross-source | Pending evaluation | The uniform layer that enables role assignment for all items |
| `thesis_news_items` (unused) | N/A — this IS the role link | Contextual intelligence | Records the contextual role assignment |
| `claim_thesis_mappings` | N/A — this IS the role link | Thesis evidence | Records the evidence role assignment |
| `claim_signal_evidences` | N/A — this IS the role link | Criterion evidence (from research findings) | Records when a research finding serves as criterion evidence |

### Key schema insight:
The schema already partially separates items from roles — junction tables (`claim_thesis_mappings`, `signal_entity_links`, `signal_data_snapshots`, `claim_signal_evidences`) record role assignments. But the item tables (`main_claims`, `signals`) are named after roles rather than item types, which creates the terminological confusion.

**No schema rename is needed.** The conceptual model guides the UI and the naming in code/docs going forward. The existing tables work fine — we just need to be precise about what's an item table vs what's a role-assignment table when designing interactions.

---

## Part 8: Terminology Guide

Seven terms. Clean separation between item types and roles.

### Item Types (what it IS)

| Term | Means | Notes |
|------|-------|-------|
| **Item** | Any piece of intelligence with intrinsic properties | Generic term — use when the specific type doesn't matter |
| **Claim** | A Toulmin-structured item from research processing | Can be factual or uncertain. The Toulmin structure (assertion, evidence, reasoning, backing, qualifier, rebuttal) is what makes it a claim, not its certainty level |
| **Data point** | A simple factual item from a market data feed | Analyst actions, earnings, economic events, SEC filings, insider transactions, FRED data |
| **Signal** | A conditional item that defines what to watch for | "If X happens, the thesis is affected." Has monitoring config (`explicit_details`). Created by `build-core-argument` or manually |

### Roles (what it DOES in the system)

| Term | Means | Notes |
|------|-------|-------|
| **Thesis Evidence** | An item supporting/refuting a thesis | The role a claim plays when linked via `claim_thesis_mappings`. Relationship type: supports / refutes / foundation. Primary during **developing** phase |
| **Signal Evidence** | An item scored against a signal | The role any item plays when it bears on a signal condition. Recorded in `signal_data_snapshots`. Assessment: strengthening / weakening / confirmed / invalidated / neutral. Primary during **monitoring** phase |
| **Intel** | An item relevant to an entity by ticker, sector, theme, or keyword | The lightest-weight role. Entity-relevant context that doesn't directly serve as thesis evidence or signal evidence. Not limited to ticker matching — macro theses resolve relevance by sector/theme. Recorded in `thesis_news_items`. Relevant in both phases |

### Supporting Terms

| Term | Means |
|------|-------|
| **Assessment** | The evaluation of how evidence bears on its target (strengthening / weakening / confirmed / invalidated / neutral) — applies to both thesis evidence and signal evidence |
| **Provenance** | Who/what assigned the role (user / skill / automation) — distinct from source, which is an item property |
| **Role assignment** | The act of linking an item to a role — can be manual, suggested, or auto |
