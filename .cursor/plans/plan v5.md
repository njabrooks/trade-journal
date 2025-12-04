# Implementation Plan v5

This is an implementation plan for this app project, labeled v5 to represent the most up-to-date version of the plan.

**Related Documents**:
- `docs/FUTURE_ENHANCEMENTS.md` - Comprehensive list of all planned enhancements with priorities and references
- `docs/actions.md` - Complete specification of triggers, rules, and actions

## 1. Data ingestion
### 1.1. Automated Flex ingestion
  - Edge function/cron to call IBKR Flex APIs (FLEX token + query IDs)
  - Reuse existing normalizers; trigger recompute on success
  - Keep manual upload for backfills
  - **Reference**: `docs/FUTURE_ENHANCEMENTS.md` #9 (High Priority)
### 1.2. Underlyings IV history ingestion ✅ COMPLETED
  - ✅ `src/lib/ingestion/underlyingsIvHistory.ts` - Ingestion module with Option Strategist scraper
  - ✅ `/api/admin/backfill-underlyings` - API endpoint for manual/automated ingestion
  - ✅ `/admin/ingestion/underlyings-iv` - Admin UI for manual ingestion
  - ✅ Scrapes Option Strategist free volatility data (weekly updates)
  - ✅ Idempotent upsert to `underlyings_iv_history` table
  - **Automated solution**: Edge function/cron can call the API endpoint weekly
  - **Future upgrade**: IBKR API integration for daily data (see #10a)
  - **Reference**: `docs/FUTURE_ENHANCEMENTS.md` #10 (High Priority) - ✅ COMPLETED
## 2. Rules 
### 2.1 Complete rules specifications
  - Refer to `docs/actions.md` for details.
### 2.2 Implement rules
  - Refine `rule_set` for `db/triage_records`
  - ✅ **State Code Change trigger** - Now enabled with optimized implementation (reads stored state codes instead of recomputing)
### 2.3 Decision-making assistant
  - Connect decision-making process to ChatGPT at strategy-detail level. 
  - Share decision context with AI and seek recommendations on optimal action (trade) to manage risk and maximise expected value for the strategy.
  - Include feature to manually capture (copy/paste, csv export or screenshot) options data (greeks, IV at relevant strikes and expiries) to facilitate advice from AI.
  - **Reference**: `docs/FUTURE_ENHANCEMENTS.md` #13 (Medium Priority)
### 2.4 Rules configuration
  - Make all rules configurable via:
    - `/admin/triage`
    - `/admin/playbook`
  - **Reference**: `docs/FUTURE_ENHANCEMENTS.md` #5 (Medium Priority) - Move from hardcoded constants to database persistence
## 3. DB problem-solving
### 3.1 Missing fields in schemas
### 3.2 Recompute issues
  - ✅ **Auto-trigger recompute** - Now implemented:
    - Auto-triggers after manual linking (positions/trades)
    - Auto-triggers after strategy merge
    - Auto-triggers after Flex ingestion (positions/trades)
  - **Reference**: `docs/FUTURE_ENHANCEMENTS.md` #21 (High Priority) - ✅ COMPLETED
### 3.3 Minor adjustments
  - It may be more accurate to change 'severity' field in triage_records schema to 'status'.
  - It may be more accurate to change 'positions' object, context and schema to 'strategy leg'?
## 4. UI dashboard enhancements
### 4.1 Workflows
  - Triage page > Action decision (Quick action)
  - Triage page > Select trigger > Evaluate options > Action decision
### 4.2 Views
  - `app/strategies/[strategyId]` 
    - `Performance` view (like Portfolio view but for a single strategy) `app/strategies/[strategyId]/performance`
      - `Abs Notional` card
      - `Unrealized PnL` card
      - `Pct NAV` card
      - `Open Positions` card
      - `PnL Timeline` sparkline
      - `Abs Notional` sparkline
      - `Open Positions` table
    - `Triage` view (rename `Alerts`?) `app/strategies/[strategyId]/triage`
      - `Playbook` card
        - Fields: Strategy Type, State Code, Template, Underlying, Opened (date), Status
      - `Playbook detail` card
        - Fields: State Code, Category, Label, Description, Checklist_items
      - `Triage Flags` list
      - `AI chat` box
    - `Blotter` view (rename `Journal`?) `app/strategies/[strategyId]/blotter`
      - `Blotter` list
      - `Recent Trades` list (perhaps merge with Blotter list, or fold trades in as a type of Blotter item?)
  - `app/blotter`
    - Require a more detailed display of all data captured and written to the db by the blotter record.
### 4.3 Features
  - search feature

---

## 5. Additional Enhancements

For a comprehensive list of all planned enhancements, see `docs/FUTURE_ENHANCEMENTS.md`. Key items not yet integrated into this plan:

### Trade & Reconciliation
- **Roll Trade Auto-Detection** (#1) - Pattern matching to auto-detect rolls
- **Trade Validation & Discrepancy Detection** (#3) - Enhanced discrepancy handling
- **Trade Decision Timeout/Resolution** (#2) - Handle pending trades that never execute

### Future Triggers
- **Underlying-Level Triggers** (#6) - IV spike, concentration risk, correlation risk
- **Account-Level Triggers** (#7) - Leverage, cash balance, margin requirements
- **Time-Based Triggers** (#8) - Weekly reviews, expiry reminders, earnings proximity

### Data Ingestion
- **Exercises/Assignments Ingestion** (#11) - Flex OPTT section
- **Cash Transactions Ingestion** (#12) - Flex CTRN section

### UI/UX
- **Manual Linking UI** (#14) - Bulk-assign positions/trades to strategies
- **Merged/Archive View** (#15) - Expose merged strategies with undo

### Testing & Quality
- **Endpoint Regression Tests** (#18) - Automated testing for ingestion
- **Data Quality Reports** (#19) - Consistency checks and error dashboards
- **Automated Tests** (#20) - Unit and integration tests

### Schema & Data Model
- **Position Lifecycle Modeling** (#16) - Explicit open/close lifecycle
- **Additional Trade Fields** (#17) - Expand trade schema

### Documentation
- **Complete Transform Documentation** (#22) - Finalize transform specs

---

## Priority Summary

**High Priority** (from `docs/FUTURE_ENHANCEMENTS.md`):
- State Code Change Performance Optimization (#4)
- Automated Flex Ingestion (#9) - *Already in section 1.1*
- Underlyings IV History Ingestion (#10) - *Already in section 1.2*
- Automated Tests (#20)
- Auto-Trigger Recompute After Data Changes (#21) - *Referenced in section 3.2*

**Medium Priority**:
- Roll Trade Auto-Detection (#1)
- Trade Validation & Discrepancy Detection (#3)
- Triage Rules Database Persistence (#5) - *Referenced in section 2.4*
- Decision-Making Assistant (#13) - *Already in section 2.3*
- Manual Linking UI (#14)
- Endpoint Regression Tests (#18)
- Data Quality Reports (#19)
