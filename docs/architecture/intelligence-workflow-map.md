# Intelligence-to-Belief Workflow Map

Complete state machine and relationship mapping for all entities, transitions, linking operations, and intelligence flows.

---

## 1. Entity Lifecycle State Machines

### Macro Thesis / Asset Thesis
```
                    ┌──────────────────────────────────────────┐
                    │                                          │
  ┌───────┐   user  ┌────────────┐  build-core-argument  ┌────────────┐
  │ draft │ ──────► │ developing │ ─────────────────────► │ monitoring │
  └───────┘         └────────────┘                        └────────────┘
     │                  │    ▲                                │    │
     │ user             │    │ user (reopen)                  │    │
     ▼                  │    │                                │    │
  ┌──────────┐         │    │                                │    │
  │ rejected │ ◄───────┘    │                                │    │
  └──────────┘              │                                │    │
     │                      │         ┌──────────┐           │    │
     │ user (reconsider)    └─────────│ complete │ ◄─────────┘    │
     ▼                                └──────────┘                │
  ┌───────┐                               ▲                      │
  │ draft │                               │ user                  │
  └───────┘                               └──────────────────────┘
```
**Transition triggers:**
| From → To | Trigger | Type | Code |
|-----------|---------|------|------|
| draft → developing | User creates thesis | Manual | `create-macro-thesis.ts` / `create-asset-thesis.ts` |
| developing → monitoring | `build-core-argument` creates articulation + signals | Skill (user-initiated) | `insert-thesis-articulation.ts` |
| monitoring → developing | User reopens for rework | Manual | `update-entity-status.ts` |
| developing → complete | User marks complete | Manual | `update-entity-status.ts` |
| monitoring → complete | User marks complete | Manual | `update-entity-status.ts` |
| developing/monitoring → rejected | User rejects | Manual | `update-entity-status.ts` |
| rejected → draft | User reconsiders | Manual | `update-entity-status.ts` |
| complete → developing | User reopens | Manual | `update-entity-status.ts` |

### Claim (main_claims)
```
  ┌───────┐   link to thesis (suggestion accepted)   ┌────────┐
  │ draft │ ────────────────────────────────────────► │ active │
  └───────┘                                           └────────┘
                                                        │    │
                                                   user │    │ user
                                                        ▼    ▼
                                                 ┌──────────┐ ┌──────────┐
                                                 │ complete │ │ rejected │
                                                 └──────────┘ └──────────┘
```
**Transition triggers:**
| From → To | Trigger | Type |
|-----------|---------|------|
| draft → active | Claim suggestion accepted (auto-promotes) | Auto on user acceptance |
| draft → active | Manual status change | Manual |
| active → complete/rejected | User decision | Manual |

### Signal
```
  ┌────────┐                    ┌──────────┐
  │ active │ ──── user ───────► │ complete │
  └────────┘                    └──────────┘
     │  ▲
     │  │ re-articulation
     │  │ supersedes old signals
     ▼  │
  ┌──────────┐
  │ rejected │ (old signals rejected when new articulation created)
  └──────────┘
```
**Transition triggers:**
| From → To | Trigger | Type |
|-----------|---------|------|
| (created as active) | `build-core-argument` → `insert-thesis-articulation.ts` | Skill |
| active → rejected | New articulation supersedes old signals | Auto |
| active → complete | User marks condition met | Manual |
| active → rejected | User dismisses | Manual |

### Strategy
```
  ┌───────┐   positions opened   ┌────────┐   all positions closed   ┌──────────┐
  │ draft │ ───────────────────► │ active │ ────────────────────────► │ complete │
  └───────┘                      └────────┘                           └──────────┘
                                    │
                                    │ user abandons
                                    ▼
                                 ┌──────────┐
                                 │ rejected │
                                 └──────────┘
```
**Transition triggers:**
| From → To | Trigger | Type |
|-----------|---------|------|
| draft → active | Positions open via ingestion | Auto (derived) |
| active → complete | All positions closed | Auto (derived) |
| active → rejected | User abandons | Manual |

### Position
```
  ┌──────┐   quantity = 0   ┌────────┐
  │ open │ ───────────────► │ closed │
  └──────┘                  └────────┘
```

---

## 2. Entity Relationships — What Creates Them

### Hierarchy Relationships (linking execution objects)

```
  Macro Thesis ◄──────────► Asset Thesis ──────────► Strategy ──────────► Position
               many-to-many              one-to-many            one-to-many
               MANUAL                    MANUAL                 AUTO (ingestion)
```

| Relationship | Table | Created By | Type | Trigger |
|-------------|-------|-----------|------|---------|
| Macro ↔ Asset Thesis | `asset_thesis_related_macro_theses` | User | Manual link | UI link dialog or API |
| Asset Thesis → Strategy | `strategies.asset_thesis_id` | User | Manual link | Strategy confirmation dialog |
| Strategy → Position | `positions.strategy_id` | System | Auto (ingestion) | `strategyAuto.ts` matches during trade/position ingestion |

### Evidence Relationships (linking belief objects)

```
  Claim ──────────► Thesis (supports/refutes/foundation)
        claim_thesis_mappings
        MANUAL or SUGGESTED

  Signal ─────────► Thesis or Strategy
         signal_entity_links
         AUTO (build-core-argument) or MANUAL (strategy signals)

  Signal Data Snapshot ──► Signal
                           AUTO (3 sources — see below)

  Claim ──────────► Signal (evidence link)
        claim_signal_evidences
        AUTO (assess-validation-evidence skill)
```

| Relationship | Table | Created By | Type | Trigger |
|-------------|-------|-----------|------|---------|
| Claim → Thesis | `claim_thesis_mappings` | User accepts AI suggestion | Suggested | `/api/research/claims/suggestions/[id]/accept` |
| Claim → Thesis | `claim_thesis_mappings` | User manual link | Manual | `/api/research/link-claim-to-thesis` or ConvertClaimToEntityDialog |
| Signal → Thesis | `signal_entity_links` | `build-core-argument` | Auto (skill) | `insert-thesis-articulation.ts` |
| Signal → Strategy | `signal_entity_links` | User creates strategy signal | Manual | `/api/signals/strategy` |
| Signal ← Snapshot | `signal_data_snapshots` | Thesis Monitor | Auto (scheduled) | `generateQualitativeSnapshots()` |
| Signal ← Snapshot | `signal_data_snapshots` | assess-validation-evidence | Auto (skill) | Research routing or manual skill |
| Signal ← Snapshot | `signal_data_snapshots` | Quantitative collector | Auto (scheduled) | `collect-signal-data.ts` |
| Claim → Signal | `claim_signal_evidences` | assess-validation-evidence | Auto (skill) | When content originates from a claim |

---

## 3. Intelligence Entry Points — How Data Enters the System

```
                         EXTERNAL SOURCES
  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────┐
  │ Research     │  │ Scheduled    │  │ Market    │  │ User     │
  │ Content      │  │ Reports      │  │ Data APIs │  │ Actions  │
  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘  └────┬─────┘
         │                │                 │              │
         ▼                ▼                 ▼              ▼
  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────┐
  │ /inbox skill│  │ ingest-world-│  │ ingest-finnhub            │
  │ (capture)   │  │ monitor.ts   │  │ ingest-sec-filings        │
  └──────┬──────┘  └──────┬───────┘  │ ingest-economic-calendar  │
         │                │          │ ingest-earnings-calendar   │
         ▼                ▼          │ ingest-fred-historical     │
  ┌─────────────┐  ┌──────────────┐ └───────────┬───────────────┘
  │ notes/inbox │  │ intelligence │              │
  │ (markdown)  │  │ _reports +   │              ▼
  └──────┬──────┘  │ _items       │  ┌───────────────────────────┐
         │         └──────┬───────┘  │ analyst_actions           │
         ▼                │          │ analyst_price_targets      │
  ┌─────────────┐         │          │ insider_transactions       │
  │ /process-   │         │          │ sec_filings                │
  │ inbox skill │         │          │ economic_events            │
  └──────┬──────┘         │          │ earnings_events            │
         │                │          │ fred_observations          │
         │                │          └───────────────────────────┘
         │                │                     │
         ▼                ▼                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                    PROCESSING LAYER                           │
  ├──────────────────────────────────────────────────────────────┤
  │                                                              │
  │  process-inbox          generateQualitative     (NOT YET     │
  │  routes to:             Snapshots():            CONNECTED)   │
  │                                                              │
  │  ┌─ claim_generation    scores intelligence     analyst,     │
  │  │  (Toulmin extract    items against active     SEC, econ,  │
  │  │   → main_claims)     signals → writes         earnings,   │
  │  │                      signal_data_snapshots    insider →   │
  │  ├─ signal_evidence                              displayed   │
  │  │  (assess-validation  dataSource =             in feed     │
  │  │   → signal_data_     'thesis_monitor'         only, no    │
  │  │   snapshots)                                  belief      │
  │  │                                               linkage     │
  │  └─ both                                                     │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

### Intelligence sources and their current routing status

| Source | Ingestion Script | Target Table(s) | Routed to Belief Layer? | How |
|--------|-----------------|-----------------|------------------------|-----|
| Research content | `/inbox` → `/process-inbox` | `research_artifacts`, `research_insights`, `main_claims` | YES | Toulmin extraction → claims; signal routing → snapshots |
| Thesis Monitor | `ingest-world-monitor.ts` | `intelligence_reports`, `intelligence_items` | YES | `generateQualitativeSnapshots()` → `signal_data_snapshots` |
| World Monitor | `ingest-world-monitor.ts` | `intelligence_reports`, `intelligence_items` | PARTIAL | Displayed in feed, not evaluated against signals |
| Analyst actions | `ingest-finnhub-analyst-data.ts` | `analyst_actions` | NO | Displayed in feed only |
| Price targets | `ingest-finnhub-analyst-data.ts` | `analyst_price_targets` | NO | Displayed in feed only |
| Insider transactions | `ingest-finnhub-analyst-data.ts` | `insider_transactions` | NO | Displayed in feed only |
| SEC filings | `ingest-sec-filings.ts` | `sec_filings` | NO | Displayed in feed only |
| Economic events | `ingest-economic-calendar.ts` | `economic_events` | NO | Displayed in feed only |
| Earnings events | `ingest-earnings-calendar.ts` | `earnings_events` | NO | Displayed in feed only |
| FRED indicators | `ingest-fred-historical.ts` | `fred_observations` | PARTIAL | Threshold breaches → `fred_threshold_breaches`, some linked to signals |

---

## 4. Lifecycle-Aware Intelligence Routing (PROPOSED)

How the thesis lifecycle phase determines where intelligence flows:

```
  Intelligence Atom arrives (any source)
         │
         ▼
  ┌──────────────────────────┐
  │ Resolve tickers to       │
  │ theses via underlyings   │
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────┐
  │ Any matching theses?     │──── NO ───► SKIP (no relevant thesis)
  └──────────┬───────────────┘
             │ YES
             ▼
  ┌──────────────────────────────────────────────────┐
  │ FOR ALL matched theses:                          │
  │ Write thesis_news_items (contextual intelligence)│
  │ + propagate to parent/child theses               │
  └──────────┬───────────────────────────────────────┘
             │
             ▼
  ┌──────────────────────────┐
  │ Thesis lifecycle phase?  │
  └──────┬──────────┬────────┘
         │          │
    DEVELOPING   MONITORING
         │          │
         ▼          ▼
  ┌────────────┐ ┌──────────────────────────────┐
  │ Rich       │ │ Score against active signals  │
  │ content?   │ │ (shared scoring algorithm)    │
  │ (>300      │ └──────────┬───────────────────┘
  │ chars body)│            │
  └──┬─────┬──┘            ▼
     │     │     ┌──────────────────────────────┐
   YES    NO     │ Signal match found?          │
     │     │     └──────┬──────────┬────────────┘
     │     │            │          │
     │     │          YES         NO
     │     │            │          │
     ▼     ▼            ▼          ▼
  ┌──────┐ ┌──┐  ┌───────────┐  ┌──────┐
  │Claim │ │  │  │ Write      │  │      │
  │candi-│ │SK│  │ signal_data│  │ DONE │
  │date  │ │IP│  │ _snapshots │  │ (con-│
  │(triage│ │  │  │ + journal  │  │ text │
  │item) │ │  │  │ entries    │  │ only)│
  └──────┘ └──┘  └───────────┘  └──────┘
  Tier 3       Tier 1 or 2
  (review)     (auto)
```

---

## 5. User Intervention Points

Every point where a human makes a decision:

### Thesis Development Phase
| Action | Where in UI | What Happens |
|--------|-------------|-------------|
| Create thesis | Thesis browser, "Create" button | Inserts draft/developing thesis |
| Link macro ↔ asset thesis | Thesis detail page, link dialog | Creates junction table record |
| Accept/reject claim suggestion | Claims browser, inline suggestion cards | Creates `claim_thesis_mapping`, auto-promotes claim draft→active |
| Manually link claim to thesis | Claims browser or thesis page, link dialog | Creates `claim_thesis_mapping` |
| Run build-core-argument | Thesis page, CTA button | Creates articulation + signals, transitions developing→monitoring |
| Review triage: NEEDS_RESEARCH | Triage page | Dismiss or act on low-claim-count thesis |
| Review triage: PRODUCE_CORE_ARGUMENT | Triage page | Prompts user to run build-core-argument |

### Thesis Monitoring Phase
| Action | Where in UI | What Happens |
|--------|-------------|-------------|
| Review auto-linked signal evidence | Signal section, evidence timeline | Dismiss/correct Tier 2 auto-links |
| Manually assess evidence | Thesis page, "Assess" button | Runs assess-validation-evidence skill |
| Complete/reject signal | Signal section, status dropdown | Marks signal as confirmed/invalidated |
| Review triage: TAXONOMY_REVIEW (proposed) | Triage page | Approve/modify/dismiss claim candidates from intelligence |
| Reopen for development | Thesis page, status change | Transitions monitoring→developing |

### Strategy & Position Management
| Action | Where in UI | What Happens |
|--------|-------------|-------------|
| Confirm strategy | Triage page, confirmation dialog | Labels strategy, optionally links to thesis |
| Link strategy to thesis | Strategy page, link dialog | Sets `strategies.asset_thesis_id` |
| Review position triage | Triage page | DTE alerts, size warnings, complexity flags |

### Research Processing
| Action | Where in UI | What Happens |
|--------|-------------|-------------|
| Process inbox item | CLI: `/process-inbox` | Extracts claims, routes to signal evidence or claim extraction |
| Override routing decision | CLI: during process-inbox | User can force route to claims, signals, or both |
| Upload research | CLI: `/finalize-for-upload` | Uploads audit to Supabase, creates claims |

---

## 6. Automated Processes (No User Intervention)

| Process | Trigger | What It Does | Schedule |
|---------|---------|-------------|----------|
| Trade/position ingestion | GitHub Actions | Creates trades, positions, links to strategies | Hourly/4-hourly |
| Triage computation | Post-ingestion | Creates/updates triage_records | After each ingestion |
| Thesis triage computation | Post-claim-link | Creates/updates thesis_triage_records | After claim linked or articulation created |
| Portfolio snapshots | Post-ingestion | Aggregates portfolio metrics | After each ingestion |
| Strategy metrics | Post-ingestion | Updates strategy performance | After each ingestion |
| Signal evaluation | Post-ingestion | Checks strategy signal conditions | After each ingestion |
| Thesis monitor snapshots | Post-report-ingestion | Scores intelligence against signals | When thesis monitor report ingested |
| Quantitative signal collection | Scheduled | Collects from data sources per signal config | Via `collect-signal-data.ts` |
| Claim suggestion generation | On-demand API | AI scores claims against theses | When user requests suggestions |
| Signal supersession | On re-articulation | Rejects old signals, creates new ones | When `build-core-argument` re-run |

---

## 7. Repeating UI Patterns Needed

Based on the state machines and relationships above, these are the repeating interaction patterns across the app:

### Pattern A: Entity Reference
**Where used:** Everywhere an entity is mentioned outside its canonical page
- Claim referenced on thesis page
- Thesis referenced on claim page
- Signal referenced on feed item
- Strategy referenced on thesis page
- Intelligence item referenced on signal timeline

**Interaction:** Click → navigate to canonical page

### Pattern B: Manual Link Creation
**Where used:** All hierarchy and evidence relationship creation
- Macro ↔ asset thesis linking
- Strategy → thesis linking
- Claim → thesis linking (manual path)
- Strategy signal creation

**Interaction:** "Link to..." button → search dialog → select → confirm

### Pattern C: Suggested Link (user approves)
**Where used:** AI-generated relationship proposals
- Claim → thesis suggestions (developing theses only)
- Claim candidates from intelligence (proposed, developing theses only)

**Interaction:** Suggestion card with reasoning + confidence → accept/reject

### Pattern D: Auto-Linked Item (user can correct)
**Where used:** System-created relationships
- Signal data snapshots (from thesis monitor, intelligence routing, quantitative collection)
- Contextual intelligence (thesis_news_items)
- Position → strategy auto-linking

**Interaction:** Appears in timeline/list with provenance badge → dismiss/correct inline

### Pattern E: Status Transition
**Where used:** All entity lifecycle changes
- Thesis: draft → developing → monitoring → complete/rejected
- Claim: draft → active → complete/rejected
- Signal: active → complete/rejected
- Strategy: draft → active → complete/rejected
- Triage: inbox → in_progress → done

**Interaction:** Status badge/dropdown → select new status → confirm (with rationale for some)

### Pattern F: Triage Attention Item
**Where used:** All "requires your attention" notifications
- Position triage (DTE, size, complexity)
- Thesis triage (needs research, produce argument, new evidence, taxonomy review)
- Strategy confirmation

**Interaction:** Appears in triage queue → review context → act (dismiss/resolve/escalate)

---

## 8. Where Each Pattern Appears on Each Page

| Page | Pattern A (Reference) | Pattern B (Manual Link) | Pattern C (Suggestion) | Pattern D (Auto-Link) | Pattern E (Status) | Pattern F (Triage) |
|------|----------------------|------------------------|----------------------|---------------------|-------------------|-------------------|
| **Thesis (developing)** | Claims, macro/asset links, strategies | Link claims, link theses | Claim suggestions | Contextual news | Thesis status | NEEDS_RESEARCH, PRODUCE_CORE_ARGUMENT |
| **Thesis (monitoring)** | Claims, signals, macro/asset links | Link theses | (suppressed) | Signal evidence, contextual news | Thesis status, signal status | EVALUATE_NEW_EVIDENCE, TAXONOMY_REVIEW |
| **Claims browser** | Linked theses, source research | Link to thesis | Claim→thesis suggestions | — | Claim status | — |
| **Signal detail** | Linked thesis, linked claims | — | — | Evidence snapshots | Signal status | — |
| **Strategy** | Linked thesis, positions | Link to thesis | — | Positions (auto-linked) | Strategy status | CONFIRM_STRATEGY, LINK_TO_THESIS |
| **News feed** | Theses, signals, strategies | — | — | Processing badges (proposed) | — | — |
| **Research** | Extracted claims, linked theses | Link claims to theses | Claim→thesis suggestions | — | Artifact status | — |
| **Triage** | All referenced entities | — | — | — | Triage status | All triage types |
| **Journal** | All referenced entities | — | — | — | — | — |
