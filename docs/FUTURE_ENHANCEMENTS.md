# Future Enhancements

**Purpose**: Single source of truth for planned enhancements with PRD traceability.

**Last Updated**: 2026-02-01 (#ENH-043 Phase 2 complete — Coinbase Prime)

---

## Quick Navigation

- [Active Work](#active-work)
- [Planned - High Priority](#planned---high-priority)
- [Planned - Medium Priority](#planned---medium-priority)
- [Deferred](#deferred-enhancements)
- [Enhancement Registry](#enhancement-registry)
- [Completed](#completed-enhancements)

---

## Active Work

*No active work in progress.*

---

## Planned - High Priority

### #ENH-038: Automated Monitoring System
**Priority**: High | **Effort**: 1-2 days | **Phase**: 3.2
**PRD**: Section 6.1 (Triggers - Automated Monitoring)
**Dependencies**: #ENH-037 (COMPLETE)
**Status**: PARTIAL - Script exists, missing GitHub Actions integration

Core monitoring script exists (`scripts/daily-signal-monitoring.ts`) that checks price/IV and FRED thresholds against signals. Missing GitHub Actions cron job to run automatically.

**Completed**:
- `signal_data_tracking` table for tracking data fetches
- `daily-signal-monitoring.ts` script (reads signals.explicit_details, checks thresholds)
- FRED API integration for economic data thresholds
- Price/IV monitoring from `underlyings_iv_history`

**Remaining**:
- GitHub Actions workflow for scheduled execution
- Web search/RSS feed integration (deferred to #ENH-039)

---

### #ENH-020: Automated Tests
**Priority**: High | **Effort**: 2-3 weeks | **Phase**: 5+
**PRD**: N/A (Infrastructure)

Unit tests for service functions, integration tests for ingestion flows, API endpoint tests.

---

### #ENH-014: Complete Manual Linking UI
**Priority**: High | **Effort**: 2-3 days | **Phase**: 5+ (Quick Win)
**PRD**: Section 4 (Data Ingestion)
**Status**: PARTIAL - UI shell exists, implementation incomplete

Add endpoints to list unlinked positions/trades. Display in table with bulk-select and filters.

**Current State**:
- UI page exists at `/admin/strategies/[id]/link/page.tsx`
- `loadUnlinkedItems()` function is empty - returns no data
- Missing: API endpoints to query unlinked positions/trades
- Missing: Actual linking logic implementation

---

## Planned - Medium Priority

### #ENH-039: News & Narratives Integration
**Priority**: Medium | **Effort**: 2-3 weeks | **Phase**: 3.3
**PRD**: Section 6.1 (Triggers)
**Dependencies**: #ENH-038

Proactive intelligence gathering, narrative tracking, cross-thesis correlations, source credibility scoring.

---

### #ENH-042D: Evidence Aggregation & Trend Analysis
**Priority**: Medium | **Effort**: 1 week | **Phase**: 3.2C
**Dependencies**: #ENH-042C

Evidence strength scores (0-100), trend visualization, conflicting evidence detection.

---

### #ENH-042E: FRED Economic Data Integration
**Priority**: Medium | **Effort**: 1-2 days | **Phase**: 3.2D (Quick Win)
**Dependencies**: #ENH-042B
**Status**: PARTIAL - Tables exist, needs UI and testing

Schema and integration exist but needs UI work:

**Completed**:
- `fred_series_metadata` table in schema
- `thesis_fred_indicators` table linking theses to FRED series
- FRED threshold checking in `daily-signal-monitoring.ts`

**Remaining**:
- UI for configuring FRED indicators on thesis detail pages
- Testing the end-to-end flow

---

### #ENH-042G: News & SEC Filing Integration
**Priority**: Medium | **Effort**: 1-2 weeks | **Phase**: 3.2D
**Dependencies**: #ENH-042B

Finnhub integration, SEC EDGAR RSS, semantic relevance scoring, auto-trigger assessment.

---

### #ENH-042H: Master Monitoring Orchestration
**Priority**: Medium | **Effort**: 1 week | **Phase**: 3.2E
**Dependencies**: #ENH-042E, #ENH-042F, #ENH-042G

Unified daily monitoring script running all data source checks.

---

### #ENH-005-triage: Triage Rules Database Persistence
**Priority**: Medium | **Effort**: 3-4 days | **Phase**: 5+
**PRD**: Section 6 (Workflow & Triage Engine)

Persist triage rules to database instead of code constants.

---

### #ENH-001-roll: Roll Trade Auto-Detection
**Priority**: Medium | **Effort**: 1 week | **Phase**: 5+
**PRD**: Section 4 (Data Ingestion)

Pattern matching to auto-detect roll trades by underlying + expiry/strike changes.

---

### #ENH-013: Decision-Making Assistant (AI)
**Priority**: Medium | **Effort**: 2-3 weeks | **Phase**: 5+
**PRD**: Section 7 (Decision Support)

ChatGPT integration at strategy-detail level for AI-assisted decision support.

---

### #ENH-023: Underlyings Allocation Management
**Priority**: Medium | **Effort**: 1-2 weeks | **Phase**: 5+
**PRD**: Section 3 (Conceptual Model)

Target percentage allocations, current vs target display, allocation-based triggers.

---

### #ENH-043: Multi-Exchange Crypto Ingestion
**Status**: In Progress (Phase 2 complete) | **Priority**: Medium | **Phase**: 5+
**PRD**: Section 4 (Data Ingestion)

Phased crypto exchange integration: HyperLiquid → Coinbase Prime → Kraken.

**Phase 0 (Foundation) — COMPLETE (2026-02-01):**
- `ingestion_cursors` table for incremental state tracking
- CRYPTO/PERP asset classes in position types, strategy auto-linking, portfolio bucketing
- Shared crypto modules: `src/lib/ingestion/crypto/` (types, pairNormalization, cursors)
- Per-account snapshot date fix in `src/db/queries/strategies.ts` (multi-exchange compatibility)

**Phase 1 (HyperLiquid) — COMPLETE (2026-02-01):**
- API client: `src/lib/ingestion/hyperliquid/` (api, fills, positions)
- Ingestion script: `scripts/ingest-hyperliquid.ts`
- GitHub Action: `.github/workflows/hyperliquid-ingestion.yml` (every 4h)
- Fills (trades), perp positions, spot positions, staked HYPE (delegations)
- No auth needed — reads use wallet address only
- Env: `HYPERLIQUID_WALLET_ADDRESS`

**Phase 2 (Coinbase Prime) — COMPLETE (2026-02-01):**
- HMAC-SHA256 auth (4 headers: key, passphrase, signature, timestamp)
- API client: `src/lib/ingestion/coinbase-prime/` (api, fills, balances)
- Ingestion script: `scripts/ingest-coinbase-prime.ts`
- GitHub Action: `.github/workflows/coinbase-prime-ingestion.yml` (every 4h, offset 15min from HL)
- Fills via `GET /v1/portfolios/{id}/fills` (cursor pagination)
- Balances via `GET /v1/portfolios/{id}/balances` (USD fiat_amount, implied mark price)
- No cost basis on positions — deferred to #ENH-051
- Env: `COINBASE_PRIME_ACCESS_KEY`, `COINBASE_PRIME_SIGNING_KEY` (base64), `COINBASE_PRIME_PASSPHRASE`, `COINBASE_PRIME_PORTFOLIO_ID`

**Phase 3 (Kraken) — PLANNED:**
- HMAC-SHA512 auth with monotonic nonce (most complex, prevents parallelization)
- Trades via `POST /0/private/TradesHistory` (50/page, rate cost 2/call — 10K trades ~ 7 min)
- Balances via `POST /0/private/Balance`, margin via `POST /0/private/OpenPositions`
- Gotcha: Non-standard pair naming (`XXBTZUSD` → `BTC`) requires mapping table
- Spot balances: no cost basis (deferred to #ENH-051); margin positions have cost/value/net PnL directly
- New: `src/lib/ingestion/kraken/` (api, trades, positions, pairMapping)
- Env: `KRAKEN_API_KEY`, `KRAKEN_API_SECRET` (base64)

---

### #ENH-051: Crypto Position Cost Basis
**Priority**: Medium | **Effort**: 3-5 days | **Phase**: 5+
**PRD**: Section 4 (Data Ingestion)
**Dependencies**: #ENH-043 (at least one exchange complete)

Compute cost basis for crypto positions from historical fills in the trades table.
Currently, positions from Coinbase Prime (and future Kraken spot) have null `avgPrice`, `costBasisMoney`, and `unrealizedPnl`.

**Options to evaluate**:
- FIFO (First In, First Out) — standard tax lot method
- Average cost — simpler, common for crypto

**Implementation**:
- Shared module: `src/lib/ingestion/crypto/costBasis.ts`
- Reads fills from `trades` table, computes running cost basis per symbol per account
- Populates `avgPrice`, `costBasisMoney`, `unrealizedPnl` on positions during ingestion
- Reusable across all crypto exchanges (Coinbase Prime, Kraken, HyperLiquid spot)
- May also need retroactive backfill for existing positions

---

### #ENH-044: Multi-Account IBKR Support
**Priority**: Medium-High | **Effort**: 1-2 weeks | **Phase**: 5+
**PRD**: Section 4 (Data Ingestion)

Multiple IBKR accounts with per-account Flex queries. Foundation for multi-exchange support.

---

### #ENH-040: Data Visualization Enhancements
**Priority**: Medium | **Effort**: 1-2 days each | **Phase**: Backlog

- Asset thesis: 90-day spot/IV chart
- Asset thesis: Options chain IV surface
- Macro thesis: FRED metrics display
- Strategy: Asset contribution waterfall
- Portfolio: Cross-asset correlation matrix

---

### #ENH-046: Claim Detail Page Linking
**Priority**: Medium | **Effort**: 2-4 hours | **Phase**: Backlog (Quick Win)

Add "Link to Thesis" button on claim detail page. Reuse existing ConvertClaimToEntityDialog.

---

## Planned - Low Priority

### #ENH-002-timeout: Trade Decision Timeout
**Priority**: Low | **Effort**: 1 week | **Phase**: 6+

Manual resolution or timeout for pending trade decisions.

---

### #ENH-015: Merged/Archive View
**Priority**: Low | **Effort**: 3-4 days | **Phase**: 6+

Expose merged strategies with optional undo functionality.

---

### #ENH-011-exercises: Exercises/Assignments Ingestion
**Priority**: Low | **Effort**: 1 week | **Phase**: 6+

Flex OPTT row ingestion for exercises.

---

### #ENH-012-cash: Cash Transactions Ingestion
**Priority**: Low | **Effort**: 1 week | **Phase**: 6+

Flex CTRN row to `cash_flows` table.

---

### #ENH-010a: IBKR API for IV History
**Priority**: Low | **Effort**: 1-2 weeks | **Phase**: 6+

Daily IV/spot from IBKR API instead of weekly Option Strategist data.

---

## Deferred Enhancements

### #ENH-003: Claims in Triage Page
**Deferred to**: Phase 4+ (requires trigger infrastructure)

Research processing generates triage trigger, claim actions resolve it.

---

### #ENH-012: Mandatory Link Triage Triggers
**Deferred to**: Phase 4+ (requires trigger infrastructure)

Generate triage records when mandatory hierarchy links missing.

---

### #ENH-007: Auto-Generate Asset Thesis Descriptions
**Deferred from**: Phase 2.6

AI-generated descriptions from linked macro theses and claims.

---

### #ENH-008-time: Time-Based Workflow Components
**Partially absorbed**: Phase 3 covers event logging, reviews, pattern recognition
**Remaining for Phase 6+**: Emotional state tracking, calendar-based triggers

---

## Enhancement Registry

**Next Enhancement ID**: #ENH-052

### ID Allocation

| Range | Phase/Area |
|-------|------------|
| #ENH-001 - #ENH-012 | Legacy (Phase 1-2) |
| #ENH-013 - #ENH-025 | Phase 2.6-2.7 |
| #ENH-035 - #ENH-039 | Phase 3.1-3.3 |
| #ENH-040 - #ENH-046 | Phase 3.2 sub-phases |
| #ENH-047 - #ENH-048 | Status field technical debt |
| #ENH-049 | Unified Entity Detail UX/UI |
| #ENH-050 | Unified Triage Action Button |
| #ENH-051 | Crypto Position Cost Basis |
| #ENH-052+ | Available |

**Format**: `#ENH-XXX` or `#ENH-XXX-name` for variants

---

## Completed Enhancements

For detailed specifications of completed work, see [docs/archive/completed-enhancements-2025-2026.md](archive/completed-enhancements-2025-2026.md).

### Summary

| Phase | Date | Key Deliverables |
|-------|------|------------------|
| #ENH-050 | 2026-01-19 | Unified Triage Action Button - TriageQuickAction component with context-aware actions, simplified synthesis UI with claim counts, ThesisClaimsBrowserWrapper |
| #ENH-049 | 2026-01-19 | Unified Entity Detail UX/UI - 3-tab pattern (Overview/Evidence/Execution) with shared layout components across all entity types |
| Bugfix | 2026-01-19 | Trade ingestion triage fix - restored `TRADE_INGESTION` triage records after blotter migration |
| #ENH-035 | 2026-01-16 | Thesis articulation generation - `/synthesize-thesis` skill, versioned articulations |
| #ENH-036 | 2026-01-16 | Signal extraction from articulation - signals table, explicit/judgment classification |
| #ENH-037 | 2026-01-16 | Manual status tracking & audit trail - signal_status_history, StatusTimeline UI |
| #ENH-042F | 2026-01-16 | IV30 & Price data integration - monitoring via daily-signal-monitoring.ts |
| #ENH-048 | 2026-01-16 | Entity status standardization - unified lifecycle (draft, active, complete, rejected) |
| #ENH-047 | 2026-01-16 | Triage severity/status separation - clean workflow vs importance fields |
| 3.2A-B | 2026-01-05 | Validation assessment workflow, database recording, status history UI |
| 2.7 | 2025-12-31 | Unified browsers for all hierarchy entities (9 of 11 complete) |
| 2.6 | 2025-12-29 | Research UX, claims browser, hierarchy linking, terminology standardization |
| 2.5 | 2025-12-22 | AI research enhancements, multi-model support |
| 2 | 2025-12-22 | Research & Intelligence Layer |
| 1 | 2025-12-21 | Beliefs & Decision Hierarchy |
| Infra | 2026-01-05 | Local-first database architecture (#ENH-041) |

### Abandoned

| ID | Name | Reason |
|----|------|--------|
| #ENH-025 | Strategy Provenance Chain | Redundant with HierarchyBreadcrumb |
| #ENH-020-playbook | Strategy Playbook Tab | Playbook removed, replaced by Signals system |

---

## Related Documents

- **PRD v1.1**: `docs/PRD_v1.1.md` - Product vision (locked)
- **Current State**: `docs/CURRENT_STATE.md` - Actual implementation state
- **Cleanup Plan**: `docs/CLEANUP_PLAN.md` - Technical debt tracking
- **Entity Status Guide**: `docs/features/entity-status-standardization.md` - Universal status model for #ENH-048
- **Completed Details**: `docs/archive/completed-enhancements-2025-2026.md`
